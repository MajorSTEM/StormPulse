from sqlalchemy import Column, String, Float, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.database import Base

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True)
    event_type = Column(String, nullable=False)
    headline = Column(String)
    description = Column(Text)
    severity = Column(String)
    urgency = Column(String)
    status = Column(String)
    onset = Column(DateTime(timezone=True))
    expires = Column(DateTime(timezone=True))
    area_description = Column(String)
    polygon_geojson = Column(Text)  # JSON string of GeoJSON polygon
    sent = Column(DateTime(timezone=True))
    effective = Column(DateTime(timezone=True))
    ends = Column(DateTime(timezone=True))
    nws_headline = Column(String)
    source_url = Column(String)
    raw_payload = Column(Text)
    ingested_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True)
    confidence_tier = Column(String, default="T1")  # T1=Official Confirmed
