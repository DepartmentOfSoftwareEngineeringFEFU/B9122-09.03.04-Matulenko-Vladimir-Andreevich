from sqlalchemy import Column, Integer, String, DateTime, Float
from datetime import datetime
from database import Base

class MeteorologicalDataLog(Base):
    __tablename__ = "weather_logs"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    upload_time = Column(DateTime, default=datetime.utcnow)
    status = Column(String)
    
    # Поля для отчета по требованию MET_004
    total_records = Column(Integer, default=0)
    earthquakes_count = Column(Integer, default=0)
    fog_count = Column(Integer, default=0)
    wind_count = Column(Integer, default=0)
    
    # Пространственный охват
    min_lat = Column(Float, nullable=True)
    max_lat = Column(Float, nullable=True)
    min_lon = Column(Float, nullable=True)
    max_lon = Column(Float, nullable=True)

class TerrainMap(Base):
    __tablename__ = "terrain_maps"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    upload_time = Column(DateTime, default=datetime.utcnow)
    resolution_x = Column(Integer)
    resolution_y = Column(Integer)
