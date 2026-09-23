from sqlalchemy import URL, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

settings = get_settings()

# URL.create safely escapes database credentials; never interpolate passwords
# into a URL string where reserved characters would corrupt the connection.
database_url = URL.create(
    "postgresql+psycopg",
    username=settings.pam_db_user,
    password=settings.pam_db_password,
    host=settings.pam_db_host,
    port=settings.pam_db_port,
    database=settings.pam_db_name,
)
engine = create_engine(database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
