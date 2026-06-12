import io
import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import json
from pydantic import ValidationError
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import engine, Base, get_db
from models import MeteorologicalDataLog, TerrainMap
from schemas import WeatherDataSchema, WeatherReportResponse, TerrainMapResponse, UploadWeatherResponse
from typing import List, Optional
from terrain_service import TerrainService
from weather_service import get_live_wind_grid
from pydantic import BaseModel as PydanticBaseModel

app = FastAPI(title="Terrain Generator API (MVP)")

# Схема ответа для /api/weather/live
class LiveWindStationSchema(PydanticBaseModel):
    name: str
    lat: float
    lon: float
    azimuth_deg: float
    speed_ms: float
    color: str

class LiveWeatherResponse(PydanticBaseModel):
    wind_stations: List[LiveWindStationSchema]

# Настройка CORS, чтобы React-фронтенд мог отправлять запросы на этот сервер
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # В реальном проекте здесь нужно указать конкретные домены (например, http://localhost:3000)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    # Создаем таблицы в БД при старте приложения
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.post("/api/v1/terrain/process-heightmap", deprecated=True)
async def process_heightmap(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    # Проверка, что загружен именно графический файл
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image.")

    try:
        # Считываем загруженный файл в память
        contents = await file.read()
        
        # Конвертируем байты в numpy массив для OpenCV
        nparr = np.frombuffer(contents, np.uint8)
        
        # Считываем изображение как черно-белое (Grayscale).
        # Это важно: карта высот представляет собой один канал, где 0 (черный) - низшая точка, а 255 (белый) - высшая.
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        
        if img is None:
            raise ValueError("Failed to decode image")

        # Применяем гауссово размытие для устранения шумов и сглаживания рельефа.
        # Размер ядра (5, 5) определяет степень размытия.
        blurred_img = cv2.GaussianBlur(img, (5, 5), 0)

        # Ресайз до фиксированного разрешения 256x256. 
        # Это критически важно: если отдать 4K карту на фронтенд, WebGL не справится с миллионами полигонов.
        # Разрешение 256x256 (65536 вершин) оптимально для быстрого рендеринга в браузере.
        target_size = (256, 256)
        resized_img = cv2.resize(blurred_img, target_size, interpolation=cv2.INTER_AREA)

        # Нормализуем значения: переводим из диапазона 0-255 в диапазон 0.0 - 1.0.
        # Это значительно упростит масштабирование (Z-Scale) на стороне клиента.
        normalized_img = resized_img.astype(np.float32) / 255.0

        # Преобразуем двумерную матрицу высот в одномерный массив (flatten).
        # Three.js ожидает именно одномерный массив в качестве буфера для атрибута positions.
        height_data = normalized_img.flatten().tolist()

        # Запись метаданных рельефа в БД (Требование CM_003)
        try:
            new_map = TerrainMap(
                filename=file.filename,
                resolution_x=target_size[0],
                resolution_y=target_size[1]
            )
            db.add(new_map)
            await db.commit()
        except Exception as db_err:
            await db.rollback()
            print(f"Error saving to DB: {db_err}")

        return JSONResponse(content={
            "resolution": target_size,
            "heights": height_data
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")

@app.post("/api/v1/weather/upload", response_model=UploadWeatherResponse, deprecated=True)
async def upload_weather_data(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Только JSON файлы разрешены")
    
    content = await file.read()
    try:
        # Парсим JSON и сразу валидируем через Pydantic (по строгим правилам WeatherDataSchema)
        data_dict = json.loads(content)
        validated_data = WeatherDataSchema(**data_dict)
    except ValidationError as e:
        # Pydantic вернет подробную ошибку, если данные выходят за пределы (например, скорость ветра > 33 или туман > 100%)
        # Статус 422 Unprocessable Entity - стандарт для ошибок валидации в REST
        raise HTTPException(status_code=422, detail=f"Ошибка валидации схемы: {e.errors()}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Неверный формат JSON")
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
        
    try:
        # Требование MET_004: Извлекаем метрики перед сохранением (сколько явлений и охват)
        eq_count = len(validated_data.earthquakes)
        fog_count = 1 if validated_data.fog else 0
        wind_count = 1 if validated_data.wind else 0
        total_records = eq_count + fog_count + wind_count

        min_lat, max_lat, min_lon, max_lon = None, None, None, None
        if eq_count > 0:
            lats = [eq.lat for eq in validated_data.earthquakes]
            lons = [eq.lon for eq in validated_data.earthquakes]
            min_lat, max_lat = min(lats), max(lats)
            min_lon, max_lon = min(lons), max(lons)

        # Запись лога загрузки в БД с рассчитанными метриками
        new_log = MeteorologicalDataLog(
            filename=file.filename,
            status="Processed Successfully",
            total_records=total_records,
            earthquakes_count=eq_count,
            fog_count=fog_count,
            wind_count=wind_count,
            min_lat=min_lat,
            max_lat=max_lat,
            min_lon=min_lon,
            max_lon=max_lon
        )
        db.add(new_log)
        await db.commit()
        await db.refresh(new_log)
        
        file_id = new_log.id
    except Exception as e:
        await db.rollback()
        file_id = -1
        print(f"Database error: {e}")

    # Возвращаем ID лога для получения отчета и провалидированные данные
    return {"file_id": file_id, "data": validated_data}

@app.get("/api/v1/weather/report/{file_id}", response_model=WeatherReportResponse)
async def get_weather_report(file_id: int, db: AsyncSession = Depends(get_db)):
    # Требование MET_004: Эндпоинт генерации отчета
    result = await db.execute(select(MeteorologicalDataLog).where(MeteorologicalDataLog.id == file_id))
    report = result.scalar_one_or_none()
    
    if not report:
        raise HTTPException(status_code=404, detail="Отчет не найден")
        
    return report

@app.get("/api/v1/terrain/maps", response_model=List[TerrainMapResponse])
async def get_terrain_maps(db: AsyncSession = Depends(get_db)):
    # Требование CM_003: Эндпоинт со списком созданных карт
    result = await db.execute(select(TerrainMap).order_by(TerrainMap.upload_time.desc()))
    maps = result.scalars().all()
    return maps

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

    # Вызов TerrainService для получения карты высот
    terrain_data = await TerrainService.get_elevation_matrix(
        lat=validated_data.metadata.center_lat,
        lon=validated_data.metadata.center_lon,
        zoom=validated_data.metadata.zoom
    )

    try:
        # Логируем загрузку в базу для отчетов (требование MET_004)
        eq_count = len(validated_data.earthquakes)
        fog_count = 1 if validated_data.fog else 0
        wind_count = 1 if validated_data.wind else 0
        total_records = eq_count + fog_count + wind_count

        min_lat, max_lat, min_lon, max_lon = None, None, None, None
        if eq_count > 0:
            lats = [eq.lat for eq in validated_data.earthquakes]
            lons = [eq.lon for eq in validated_data.earthquakes]
            min_lat, max_lat = min(lats), max(lats)
            min_lon, max_lon = min(lons), max(lons)

        new_log = MeteorologicalDataLog(
            filename=file.filename,
            status="Processed Successfully (Simulation API)",
            total_records=total_records,
            earthquakes_count=eq_count,
            fog_count=fog_count,
            wind_count=wind_count,
            min_lat=min_lat,
            max_lat=max_lat,
            min_lon=min_lon,
            max_lon=max_lon
        )
        db.add(new_log)
        await db.commit()
        await db.refresh(new_log)
        file_id = new_log.id
    except Exception as e:
        await db.rollback()
        file_id = None
        print(f"Database error: {e}")

    # Формируем итоговый JSON-ответ
    return {
        "file_id": file_id,
        "terrain": terrain_data,
        "weather": validated_data.dict()
    }


@app.get("/api/weather/live", response_model=LiveWeatherResponse)
async def get_live_weather(lat: float, lon: float):
    """
    Получение реальных данных ветра с Open-Meteo API.
    Генерирует 4 виртуальные метеостанции (Bounding Box) вокруг заданной точки
    и возвращает массив wind_stations, совместимый с фронтендом.
    """
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
