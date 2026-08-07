from sqlalchemy import Column, String, DateTime
from app.database import Base


class IngestionState(Base):
    """
    Last-known ingestion outcome per upstream source, persisted so staleness
    tracking (cache-fallback contingency, NIST CP-10) survives restarts.
    """
    __tablename__ = "ingestion_state"

    source = Column(String, primary_key=True)   # nws_alerts | nws_lsr | corridor_engine
    last_success = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(String, nullable=True)
    status = Column(String, default="pending")  # pending | ok | error
