import logging
import time
from typing import Any

import httpx
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


class JWTValidationError(Exception):
    """Raised when a token fails cryptographic or claims validation."""


class JWKSClient:
    """
    Fetches and caches Keycloak's JWKS document.

    Keys are cached in memory with a TTL so we don't hammer Keycloak on every
    request, but still pick up key rotations within a reasonable window.
    """

    def __init__(self, settings: Settings, ttl_seconds: int = 300):
        self._settings = settings
        self._ttl_seconds = ttl_seconds
        self._jwks: dict[str, Any] | None = None
        self._fetched_at: float = 0.0

    async def get_jwks(self, force_refresh: bool = False) -> dict[str, Any]:
        now = time.monotonic()
        if (
            not force_refresh
            and self._jwks is not None
            and (now - self._fetched_at) < self._ttl_seconds
        ):
            return self._jwks

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self._settings.jwks_url)
            response.raise_for_status()
            self._jwks = response.json()
            self._fetched_at = now
            logger.debug("Refreshed JWKS from %s", self._settings.jwks_url)
            return self._jwks

    def _find_signing_key(self, jwks: dict[str, Any], kid: str | None) -> dict[str, Any]:
        keys = jwks.get("keys", [])
        if kid:
            for key in keys:
                if key.get("kid") == kid:
                    return key
        # Fallback: some tokens omit kid; use the first RS256 key
        for key in keys:
            if key.get("kty") == "RSA" and key.get("use", "sig") == "sig":
                return key
        raise JWTValidationError("No matching signing key found in JWKS")

    def _validate_audience(self, claims: dict[str, Any]) -> None:
        """
        Keycloak access tokens may put the client in `aud`, `azp`, or both.
        We accept the token if any of these match our configured client_id.
        """
        client_id = self._settings.keycloak_client_id
        aud = claims.get("aud")
        azp = claims.get("azp")

        aud_values: list[str] = []
        if isinstance(aud, str):
            aud_values = [aud]
        elif isinstance(aud, list):
            aud_values = aud

        if client_id in aud_values or azp == client_id:
            return

        # Keycloak default audience for account tokens
        if "account" in aud_values and azp == client_id:
            return

        raise JWTValidationError(
            f"Invalid audience: aud={aud!r}, azp={azp!r}, expected client_id={client_id!r}"
        )

    async def validate_token(self, token: str) -> dict[str, Any]:
        """Verify RS256 signature and standard claims; return decoded payload."""
        try:
            header = jwt.get_unverified_header(token)
        except JWTError as exc:
            raise JWTValidationError("Malformed token header") from exc

        kid = header.get("kid")
        jwks = await self.get_jwks()
        signing_key = self._find_signing_key(jwks, kid)

        try:
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                issuer=self._settings.issuer,
                options={
                    "verify_aud": False,  # Keycloak audience varies; we validate manually
                    "verify_at_hash": False,
                },
            )
        except ExpiredSignatureError as exc:
            raise JWTValidationError("Token has expired") from exc
        except JWTClaimsError as exc:
            raise JWTValidationError(f"Invalid token claims: {exc}") from exc
        except JWTError as exc:
            # Retry once with fresh JWKS in case keys rotated
            jwks = await self.get_jwks(force_refresh=True)
            signing_key = self._find_signing_key(jwks, kid)
            try:
                claims = jwt.decode(
                    token,
                    signing_key,
                    algorithms=["RS256"],
                    issuer=self._settings.issuer,
                    options={
                        "verify_aud": False,
                        "verify_at_hash": False,
                    },
                )
            except JWTError as retry_exc:
                raise JWTValidationError("Token signature verification failed") from retry_exc

        self._validate_audience(claims)
        return claims


_jwks_client: JWKSClient | None = None


def get_jwks_client() -> JWKSClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = JWKSClient(get_settings())
    return _jwks_client
