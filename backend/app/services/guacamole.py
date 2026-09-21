import base64
import hashlib
import hmac
import json
from datetime import datetime
from urllib.parse import urlencode

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from app.config import Settings
from app.services.vault import IssuedSshCredential


def build_redirect_url(
    settings: Settings,
    *,
    username: str,
    request_id: str,
    target_host: str,
    target_port: int,
    target_username: str,
    expires_at: datetime,
    credential: IssuedSshCredential,
) -> str:
    """Return a Guacamole auth-json handoff URL without persisting SSH material."""
    # Guacamole's SSH `public-key` parameter takes the Base64 portion of the
    # OpenSSH public credential. For a Vault SSH certificate that credential
    # is the `ssh-*-cert-v01@openssh.com` line returned by Vault.
    certificate_parts = credential.certificate.split()
    if len(certificate_parts) < 2:
        raise ValueError("Vault returned an invalid SSH certificate")

    payload = {
        "username": username,
        "expires": int(expires_at.timestamp() * 1000),
        "connections": {
            f"PAM {request_id}": {
                "protocol": "ssh",
                "parameters": {
                    "hostname": target_host,
                    "port": str(target_port),
                    "username": target_username,
                    "private-key": credential.private_key,
                    "public-key": certificate_parts[1],
                },
            }
        },
    }
    plaintext = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    key = bytes.fromhex(settings.guacamole_json_secret)
    signed = hmac.new(key, plaintext, hashlib.sha256).digest() + plaintext
    padder = padding.PKCS7(algorithms.AES.block_size).padder()
    encryptor = Cipher(algorithms.AES(key), modes.CBC(b"\x00" * 16)).encryptor()
    encrypted = encryptor.update(padder.update(signed) + padder.finalize()) + encryptor.finalize()
    data = base64.b64encode(encrypted).decode("ascii")
    return f"{settings.guacamole_public_url.rstrip('/')}?{urlencode({'data': data})}"
