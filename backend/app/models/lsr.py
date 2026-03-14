from sqlalchemy import Column, String, Float, DateTime, Text, Integer
from sqlalchemy.sql import func
from app.database import Base

class LSR(Base):
    __tablename__ = "lsrs"

    id = Column(String, primary_key=True)
    type_code = Column(String)  # T=Tornado, W=Wind, H=Hail, etc.
    type_description = Column(String)
    magnitude = Column(Float, nullable=True)
    magnitude_units = Column(String, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    city = Column(String)
    county = Column(String)
    state = Column(String)
    remark = Column(Text)
    event_time = Column(DateTime(timezone=True))
    source_type = Column(String)
    wfo = Column(String)  # Weather Forecast Office
    raw_payload = Column(Text)
    ingested_at = Column(DateTime(timezone=True), server_default=func.now())
    confidence_tier = Column(String, default="T2")  # T2=Official Near-Real-Time
