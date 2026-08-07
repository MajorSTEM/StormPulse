from sqlalchemy import Column, Integer, Float, String
from app.database import Base


class TornadoHistory(Base):
    """
    One row per recorded US tornado from the SPC 1950-present database
    (www.spc.noaa.gov/wcm/data). Loaded once by the history loader; start/end
    coordinates give the surveyed path segment.
    """
    __tablename__ = "tornado_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    om = Column(Integer)                       # SPC tornado number (per year)
    year = Column(Integer, index=True)
    date = Column(String)                      # YYYY-MM-DD
    time = Column(String)                      # HH:MM:SS local (CST-based per SPC)
    state = Column(String, index=True)         # two-letter
    ef = Column(Integer, index=True)           # F/EF magnitude; -9 = unknown
    injuries = Column(Integer)
    fatalities = Column(Integer)
    loss = Column(Float)                       # property loss (SPC-era-dependent units)
    start_lat = Column(Float, nullable=False)
    start_lon = Column(Float, nullable=False)
    end_lat = Column(Float)                    # 0.0 when no surveyed end point
    end_lon = Column(Float)
    length_mi = Column(Float)
    width_yd = Column(Float)
