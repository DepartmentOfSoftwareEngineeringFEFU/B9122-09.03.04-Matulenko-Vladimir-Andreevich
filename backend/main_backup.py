import io
import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, HTTPException
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

app = FastAPI(title="Terrain Generator API (MVP)")

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

@app.post("/api/v1/terrain/process-heightmap", deprecated=True)
async def process_heightmap(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image.")
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError("Failed to decode image")
        blurred_img = cv2.GaussianBlur(img, (5, 5), 0)
        target_size = (256, 256)
        resized_img = cv2.resize(blurred_img, target_size, interpolation=cv2.INTER_AREA)
        normalized_img = resized_img.astype(np.float32) / 255.0
        height_data = normalized_img.flatten().tolist()
        return JSONResponse(content={
            "resolution": target_size,
            "heights": height_data
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")

@app.post("/api/v1/weather/upload", response_model=UploadWeatherResponse, deprecated=True)
async def upload_weather_data(file: UploadFile = File(...)):
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
        
    return {"file_id": -1, "data": validated_data}

@app.post("/api/v1/simulation/process")
async def process_simulation(file: UploadFile = File(...)):
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

    return {
        "terrain": terrain_data,
        "weather": validated_data.dict()
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
