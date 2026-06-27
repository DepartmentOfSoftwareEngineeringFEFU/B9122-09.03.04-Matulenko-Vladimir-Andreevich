from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import json
from pydantic import ValidationError
from schemas import WeatherDataSchema, UploadWeatherResponse
from typing import List, Optional
from terrain_service import TerrainService
from weather_service import get_live_wind_grid
from pydantic import BaseModel as PydanticBaseModel
import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from database import engine, Base, get_db
import models

app = FastAPI(title="Terrain Generator API (MVP)")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

class LiveWindStationSchema(PydanticBaseModel):
    name: str
    lat: float
    lon: float
    azimuth_deg: float
    speed_ms: float
    color: str

class LiveWeatherResponse(PydanticBaseModel):
    wind_stations: List[LiveWindStationSchema]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/v1/simulation/process")
async def process_simulation(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Только JSON файлы разрешены")
    
    content = await file.read()
    try:
        data_dict = json.loads(content)
        validated_data = WeatherDataSchema(**data_dict)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Ошибка валидации схемы: {e.errors()}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Неверный формат JSON")
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    terrain_data = await TerrainService.get_elevation_matrix(
        lat=validated_data.metadata.center_lat,
        lon=validated_data.metadata.center_lon,
        zoom=validated_data.metadata.zoom
    )

    await db.execute(delete(models.WindStation))
    await db.execute(delete(models.Earthquake))
    
    if validated_data.earthquakes:
        eq_objects = [models.Earthquake(
            lat=eq.lat, lon=eq.lon, magnitude=eq.magnitude, depth_km=eq.depth_km
        ) for eq in validated_data.earthquakes]
        db.add_all(eq_objects)

    wind_objects = []
    if validated_data.wind_stations:
        wind_objects = [models.WindStation(
            lat=ws.lat, lon=ws.lon, speed_ms=ws.speed_ms, azimuth_deg=ws.azimuth_deg,
            color=ws.color, name=ws.name
        ) for ws in validated_data.wind_stations]
    elif validated_data.wind:
        wind_objects = [models.WindStation(
            lat=validated_data.metadata.center_lat, 
            lon=validated_data.metadata.center_lon,
            speed_ms=validated_data.wind.speed_ms, 
            azimuth_deg=validated_data.wind.azimuth_deg,
            color="#ffffff", name="Legacy Wind"
        )]
    if wind_objects:
        db.add_all(wind_objects)

    result = await db.execute(select(models.SimulationState).where(models.SimulationState.id == 1))
    state = result.scalars().first()
    if not state:
        state = models.SimulationState(id=1)
        db.add(state)
    
    state.center_lat = validated_data.metadata.center_lat
    state.center_lon = validated_data.metadata.center_lon
    state.zoom = validated_data.metadata.zoom
    
    if validated_data.fog:
        state.fog_density = validated_data.fog.density
        state.fog_top_height_m = validated_data.fog.top_height_m
        state.fog_color = validated_data.fog.color
    else:
        state.fog_density = None
        state.fog_top_height_m = None
        state.fog_color = None

    await db.commit()

    fog_dict = validated_data.fog.dict() if validated_data.fog else None
    metadata_dict = validated_data.metadata.dict()

    return {
        "terrain": terrain_data,
        "metadata": metadata_dict,
        "fog": fog_dict,
        "has_custom_wind": bool(wind_objects)
    }


@app.get("/api/v1/data/spatial")
async def get_spatial_data(
    min_lat: float, max_lat: float, min_lon: float, max_lon: float,
    db: AsyncSession = Depends(get_db)
):
    eq_result = await db.execute(
        select(models.Earthquake).where(
            models.Earthquake.lat >= min_lat,
            models.Earthquake.lat <= max_lat,
            models.Earthquake.lon >= min_lon,
            models.Earthquake.lon <= max_lon
        )
    )
    earthquakes = eq_result.scalars().all()

    ws_result = await db.execute(select(models.WindStation))
    wind_stations = ws_result.scalars().all()

    return {
        "earthquakes": [
            {"lat": eq.lat, "lon": eq.lon, "magnitude": eq.magnitude, "depth_km": eq.depth_km}
            for eq in earthquakes
        ],
        "wind_stations": [
            {"lat": ws.lat, "lon": ws.lon, "speed_ms": ws.speed_ms, 
             "azimuth_deg": ws.azimuth_deg, "color": ws.color, "name": ws.name}
            for ws in wind_stations
        ]
    }

@app.get("/api/weather/live", response_model=LiveWeatherResponse)
async def get_live_weather(lat: float, lon: float):
    try:
        stations = await get_live_wind_grid(lat, lon)
        if not stations:
            raise HTTPException(
                status_code=502,
                detail="Не удалось получить данные от Open-Meteo. Проверьте подключение к интернету."
            )
        return {"wind_stations": stations}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка сервиса погоды: {str(e)}")
