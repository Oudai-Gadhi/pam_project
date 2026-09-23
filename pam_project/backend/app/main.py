import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import get_settings
from app.database import Base, engine
from app import models  # noqa: F401 - registers Phase 2 models before table creation
from app.routes import health, me, requests

settings = get_settings()

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))

app = FastAPI(
    title="PAM Broker",
    description="PAM broker: authentication and access-request workflow",
    version="0.2.0",
)

# CORS must allow credentials so Axios can send Authorization headers from the SPA origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(me.router)
app.include_router(requests.router)


@app.on_event("startup")
def create_broker_tables() -> None:
    # Bootstrap only the broker-owned schema. Keycloak remains independent.
    Base.metadata.create_all(bind=engine)
    # The project started without a migration framework. These additive changes
    # keep existing lab databases usable; production deployments should replace
    # this bootstrap migration with Alembic before the first release.
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS requester_ip VARCHAR(64)"))
        connection.execute(text("ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMP WITH TIME ZONE"))
        connection.execute(text("ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS connect_issued_at TIMESTAMP WITH TIME ZONE"))
        connection.execute(text("ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS certificate_serial VARCHAR(255)"))
