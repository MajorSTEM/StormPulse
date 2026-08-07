from sqlalchemy import Column, Integer, Float, String, Text
from app.database import Base


class TornadoHistory(Base):
    """
    One row per recorded US tornado, merged from two official sources:

    - SPC tornado database (1950-2024): the canonical historical archive;
      paths are straight start->end survey segments.
    - NWS Damage Assessment Toolkit (2025-present): live survey uploads with
      full multi-vertex tracks, surveyed max wind, damage figures, and
      surveyor remarks.
    """
    __tablename__ = "tornado_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    om = Column(Integer)                       # SPC tornado number (per year)
    year = Column(Integer, index=True)
    date = Column(String)                      # YYYY-MM-DD
    time = Column(String)                      # touchdown time HH:MM(:SS)
    state = Column(String, index=True)         # two-letter
    ef = Column(Integer, index=True)           # F/EF magnitude; -9 = unrated
    injuries = Column(Integer)
    fatalities = Column(Integer)
    loss = Column(Float)                       # SPC loss (era-dependent units)
    start_lat = Column(Float, nullable=False)
    start_lon = Column(Float, nullable=False)
    end_lat = Column(Float)                    # 0.0 when no surveyed end point
    end_lon = Column(Float)
    length_mi = Column(Float)
    width_yd = Column(Float)
    # ── NWS DAT survey extras (nullable; absent on SPC archive rows) ─────────
    source = Column(String, default="SPC")     # "SPC" | "NWS DAT"
    end_time = Column(String, nullable=True)   # lift-off time HH:MM
    max_wind_mph = Column(Integer, nullable=True)
    prop_damage = Column(Float, nullable=True)  # reported property damage, USD
    remarks = Column(Text, nullable=True)      # surveyor comments
    path_geojson = Column(Text, nullable=True)  # full multi-vertex track (GeoJSON)
