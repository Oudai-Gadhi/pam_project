from functools import lru_cache
import json

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables — never hardcode secrets."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # In Docker, Compose supplies host.docker.internal to reach Keycloak on the VM.
    keycloak_url: str = "http://host.docker.internal:8080"
    # The issuer uses the URL seen by the Windows browser, never the Docker host alias.
    keycloak_public_url: str = "http://localhost:8080"
    keycloak_realm: str = "pam"
    keycloak_client_id: str = "pam-app"

    frontend_url: str = "http://localhost:3000"
    log_level: str = "INFO"
    pam_db_host: str = "pam-db"
    pam_db_port: int = 5432
    pam_db_name: str = "pam"
    pam_db_user: str = "pam"
    pam_db_password: str

    # Vault is reached only by the broker. This token must be a dedicated,
    # least-privilege token in real deployments, never Vault's root token.
    vault_addr: str = "http://host.docker.internal:8200"
    vault_token: str = Field(repr=False)
    vault_ssh_mount: str = "ssh-client-signer"
    vault_ssh_role: str = "dev-role"
    vault_verify_tls: bool = True

    # The auth-json secret is a 16-byte value encoded as 32 hexadecimal
    # characters. It is shared only by this backend and Guacamole.
    guacamole_public_url: str = "http://localhost:8081/guacamole"
    guacamole_json_secret: str = Field(repr=False)
    pam_targets_json: str = "{}"

    @field_validator("guacamole_json_secret")
    @classmethod
    def validate_guacamole_secret(cls, value: str) -> str:
        try:
            if len(bytes.fromhex(value)) != 16:
                raise ValueError
        except ValueError as exc:
            raise ValueError("GUACAMOLE_JSON_SECRET must be exactly 32 hexadecimal characters") from exc
        return value

    @property
    def jwks_url(self) -> str:
        return f"{self.keycloak_url}/realms/{self.keycloak_realm}/protocol/openid-connect/certs"

    @property
    def issuer(self) -> str:
        # Tokens are issued with the public hostname; JWKS fetch may use a private route.
        return f"{self.keycloak_public_url}/realms/{self.keycloak_realm}"

    @property
    def targets(self) -> dict[str, dict]:
        """Registered targets; callers must never supply arbitrary hosts."""
        try:
            targets = json.loads(self.pam_targets_json)
        except json.JSONDecodeError as exc:
            raise ValueError("PAM_TARGETS_JSON must be valid JSON") from exc
        if not isinstance(targets, dict):
            raise ValueError("PAM_TARGETS_JSON must be a JSON object")
        return targets


@lru_cache
def get_settings() -> Settings:
    return Settings()
