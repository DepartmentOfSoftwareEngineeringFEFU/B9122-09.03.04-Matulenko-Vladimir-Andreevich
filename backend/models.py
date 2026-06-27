from sqlalchemy import Column, Integer, Float, String, Boolean
from database import Base

class WindStation(Base):
    __tablename__ = "wind_stations"
    id = Column(Integer, primary_key=True, index=True)
    lat = Column(Float, index=True)
    lon = Column(Float, index=True)
    speed_ms = Column(Float)
    azimuth_deg = Column(Float)
    color = Column(String, nullable=True)
    name = Column(String, nullable=True)

class Earthquake(Base):
    __tablename__ = "earthquakes"
    id = Column(Integer, primary_key=True, index=True)
    lat = Column(Float, index=True)
    lon = Column(Float, index=True)
    magnitude = Column(Float)
    depth_km = Column(Float)

class SimulationState(Base):
    """Таблица для глобальных настроек (хранит ровно 1 строку)"""
    __tablename__ = "simulation_state"
    id = Column(Integer, primary_key=True, default=1)
    center_lat = Column(Float)
    center_lon = Column(Float)
    zoom = Column(Integer)
    fog_density = Column(Float, nullable=True)
    fog_top_height_m = Column(Float, nullable=True)
    fog_color = Column(String, nullable=True)
