from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class EarthquakeSchema(BaseModel):
    magnitude: float = Field(..., ge=1, le=10, description="Магнитуда землетрясения от 1 до 10")
    depth_km: float = Field(..., ge=0, le=700, description="Глубина очага в км")
    lat: float = Field(..., ge=-90, le=90, description="Географическая широта")
    lon: float = Field(..., ge=-180, le=180, description="Географическая долгота")

class FogSchema(BaseModel):
    density_percent: float = Field(..., ge=0, le=100, description="Плотность тумана от 0% до 100%")
    layer_thickness_km: float = Field(..., ge=1, le=9, description="Толщина слоя тумана в км")

class WindSchema(BaseModel):
    speed_ms: float = Field(..., ge=0, le=33, description="Скорость ветра м/с до ураганных значений")
    azimuth_deg: float = Field(..., ge=0, le=360, description="Направление в градусах откуда дует ветер")

class MetadataSchema(BaseModel):
    center_lat: float = Field(..., description="Широта центра симуляции")
    center_lon: float = Field(..., description="Долгота центра симуляции")
    zoom: int = Field(11, description="Зум карты (по умолчанию 11)")

class WeatherDataSchema(BaseModel):
    metadata: MetadataSchema = Field(..., description="Метаданные для привязки симуляции (координаты, зум)")
    earthquakes: List[EarthquakeSchema] = []
    fog: Optional[FogSchema] = None
    wind: Optional[WindSchema] = None

# Схема для ответа с отчетом (MET_004)
class WeatherReportResponse(BaseModel):
    id: int
    filename: str
    upload_time: datetime
    total_records: int
    earthquakes_count: int
    fog_count: int
    wind_count: int
    min_lat: Optional[float]
    max_lat: Optional[float]
    min_lon: Optional[float]
    max_lon: Optional[float]

# Схема для ответа с картами (CM_003)
class TerrainMapResponse(BaseModel):
    id: int
    filename: str
    upload_time: datetime
    resolution_x: int
    resolution_y: int

class UploadWeatherResponse(BaseModel):
    file_id: int
    data: WeatherDataSchema
