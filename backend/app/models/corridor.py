from sqlalchemy import Column, String, Float, DateTime, Text, Integer
from sqlalchemy.sql import func
from app.database import Base

class Corridor(Base):
    __tablename__ = "corridors"

    id = Column(String, primary_key=True)
    incident_id = Column(String)
    polygon_geojson = Column(Text)  # GeoJSON polygon string
    centerline_geojson = Column(Text)  # GeoJSON LineString
    confidence_score = Column(Float)
    confidence_label = Column(String)  # HIGH, MEDIUM, LOW
    explanation = Column(Text)  # Human-readable "why this corridor exists"
    lsr_ids = Column(Text)  # JSON array of contributing LSR ids
    alert_ids = Column(Text)  # JSON array of contributing alert ids
    severity_estimate = Column(String)
    event_start = Column(DateTime(timezone=True))
    event_end = Column(DateTime(timezone=True))
    state = Column(String)
    county_list = Column(Text)  # JSON array
    motion_direction_deg = Column(Float, nullable=True)
    motion_speed_kts = Column(Float, nullable=True)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    confidence_tier = Column(String, default="T3")  # T3=Inferred
    event_category = Column(String, default="TORNADO")  # TORNADO, WIND_DAMAGE, SEVERE_WEATHER, FLOOD_ZONE
    # v2 engine fields
    engine_version = Column(String, nullable=True)           # "v2" or "official"
    motion_consistency_score = Column(Float, nullable=True)  # 0-1; circular R of bearing pairs
    inlier_count = Column(Integer, nullable=True)            # reports matching motion model
    outlier_count = Column(Integer, nullable=True)           # reports rejected as off-track
    confidence_band_geojson = Column(Text, nullable=True)    # JSON: {core, spread, extension}
