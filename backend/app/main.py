import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
def create_phase_two_tables() -> None:
    # Bootstrap only the broker-owned schema. Keycloak remains independent.
    Base.metadata.create_all(bind=engine)
