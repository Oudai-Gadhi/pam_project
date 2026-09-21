from functools import lru_cache

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

    @property
    def jwks_url(self) -> str:
        return f"{self.keycloak_url}/realms/{self.keycloak_realm}/protocol/openid-connect/certs"

    @property
    def issuer(self) -> str:
        # Tokens are issued with the public hostname; JWKS fetch may use a private route.
        return f"{self.keycloak_public_url}/realms/{self.keycloak_realm}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
