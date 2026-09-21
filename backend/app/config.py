from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables — never hardcode secrets."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Keycloak runs on the same VM — backend fetches JWKS via localhost
    keycloak_url: str = "http://localhost:8080"
    # JWT `iss` claim also uses localhost because browser and backend share the same host
    keycloak_public_url: str = "http://localhost:8080"
    keycloak_realm: str = "pam"
    keycloak_client_id: str = "pam-app"

    frontend_url: str = "http://localhost:3000"
    log_level: str = "INFO"

    @property
    def jwks_url(self) -> str:
        return f"{self.keycloak_url}/realms/{self.keycloak_realm}/protocol/openid-connect/certs"

    @property
    def issuer(self) -> str:
        # Tokens are issued with the public hostname because Keycloak is reached via localhost
        return f"{self.keycloak_public_url}/realms/{self.keycloak_realm}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
