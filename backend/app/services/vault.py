from dataclasses import dataclass

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import generate_private_key

from app.config import Settings


class VaultError(RuntimeError):
    pass


@dataclass(frozen=True)
class IssuedSshCredential:
    private_key: str
    certificate: str
    serial_number: str


def issue_ssh_credential(settings: Settings, *, principal: str, ttl_minutes: int) -> IssuedSshCredential:
    """Generate an in-memory RSA key and ask Vault to sign its public half.

    Guacamole's libssh2-based SSH client supports RSA OpenSSH certificates;
    it rejects Ed25519 certificate credentials. Vault's CA can still remain
    Ed25519 because the generated *user* key determines certificate type.
    """
    private_key = generate_private_key(public_exponent=65537, key_size=3072)
    private_text = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode("utf-8")
    public_text = private_key.public_key().public_bytes(
        serialization.Encoding.OpenSSH,
        serialization.PublicFormat.OpenSSH,
    ).decode("ascii")

    try:
        response = httpx.post(
            f"{settings.vault_addr.rstrip('/')}/v1/{settings.vault_ssh_mount}/sign/{settings.vault_ssh_role}",
            headers={"X-Vault-Token": settings.vault_token},
            json={"public_key": public_text, "valid_principals": principal, "ttl": f"{ttl_minutes}m"},
            verify=settings.vault_verify_tls,
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()["data"]
        return IssuedSshCredential(
            private_key=private_text,
            certificate=data["signed_key"],
            serial_number=str(data.get("serial_number", "")),
        )
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise VaultError("Vault could not issue the SSH certificate") from exc
