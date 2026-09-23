from typing import Annotated, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt_validator import JWTValidationError, get_jwks_client

# auto_error=False lets us return a consistent 401 message
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict:
    """
    FastAPI dependency that validates the Bearer token and returns JWT claims.
    All protected endpoints should depend on this — never trust frontend group checks alone.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = await get_jwks_client().validate_token(credentials.credentials)
    except JWTValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return claims


def get_user_groups(user: dict) -> list[str]:
    groups = user.get("groups", [])
    if isinstance(groups, str):
        return [groups]
    return groups if isinstance(groups, list) else []


def require_group(group_name: str) -> Callable:
    """
    Factory for group-gated dependencies used by future Phase 2 endpoints.

    Usage:
        @router.get("/requests", dependencies=[Depends(require_group("pam_users"))])
    """

    async def _require_group(
        user: Annotated[dict, Depends(get_current_user)],
    ) -> dict:
        groups = get_user_groups(user)
        if group_name not in groups:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires membership in group '{group_name}'",
            )
        return user

    return _require_group
