"""
WeatherService — Сервис получения реальных метеоданных с Open-Meteo API.

Использует алгоритм Bounding Box для генерации 4 виртуальных метеостанций
по углам области вокруг заданного центра, запрашивая реальные данные ветра
для каждой точки параллельно через asyncio.gather.

Использует aiohttp вместо httpx — более совместим с системными прокси Windows.
"""

import aiohttp
import asyncio
from typing import List, Dict, Optional


# Отступ в градусах от центральной точки для формирования Bounding Box.
# 0.05° ≈ 5.5 км на экваторе, ~4 км на широте Владивостока.
# Итого BBox покрывает область ~8×8 км — достаточно для IDW-интерполяции.
OFFSET_DEG = 0.05

# Таймаут HTTP-запроса к Open-Meteo (секунды)
REQUEST_TIMEOUT = 15.0

# Имена точек для удобства отображения на фронтенде
POINT_NAMES = [
    "Северо-Запад",
    "Северо-Восток",
    "Юго-Запад",
    "Юго-Восток",
]

# Цвета для каждой из 4 станций (используются фронтендом для визуализации)
POINT_COLORS = [
    "#00bfff",  # Голубой
    "#ff6b6b",  # Коралловый
    "#51cf66",  # Зелёный
    "#ffd43b",  # Жёлтый
]


def _generate_grid_points(center_lat: float, center_lon: float) -> List[Dict]:
    """
    Генерация 4 точек Bounding Box вокруг центральной координаты.

    Схема:
      NW ---- NE
      |  cent  |
      SW ---- SE

    Каждая точка смещена на ±OFFSET_DEG по широте и долготе.
    """
    return [
        {"name": POINT_NAMES[0], "lat": center_lat + OFFSET_DEG, "lon": center_lon - OFFSET_DEG, "color": POINT_COLORS[0]},  # NW
        {"name": POINT_NAMES[1], "lat": center_lat + OFFSET_DEG, "lon": center_lon + OFFSET_DEG, "color": POINT_COLORS[1]},  # NE
        {"name": POINT_NAMES[2], "lat": center_lat - OFFSET_DEG, "lon": center_lon - OFFSET_DEG, "color": POINT_COLORS[2]},  # SW
        {"name": POINT_NAMES[3], "lat": center_lat - OFFSET_DEG, "lon": center_lon + OFFSET_DEG, "color": POINT_COLORS[3]},  # SE
    ]


async def _fetch_weather_for_point(
    session: aiohttp.ClientSession,
    point: Dict
) -> Optional[Dict]:
    """
    Запрос текущей погоды для одной точки через Open-Meteo API.

    Open-Meteo API (бесплатное, без ключа):
      GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true

    Ответ содержит:
      current_weather.windspeed       — скорость в км/ч
      current_weather.winddirection   — азимут в градусах (откуда дует ветер)
      current_weather.temperature     — температура °C

    Конвертация: км/ч → м/с: умножаем на 0.277778 (т.е. делим на 3.6)
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": point["lat"],
        "longitude": point["lon"],
        "current_weather": "true",
    }

    try:
        async with session.get(url, params=params) as response:
            response.raise_for_status()
            data = await response.json()

        current = data.get("current_weather", {})
        windspeed_kmh = current.get("windspeed", 0)
        winddirection = current.get("winddirection", 0)

        # Конвертация км/ч → м/с
        speed_ms = round(windspeed_kmh * 0.277778, 2)

        return {
            "name": point["name"],
            "lat": point["lat"],
            "lon": point["lon"],
            "azimuth_deg": winddirection,
            "speed_ms": speed_ms,
            "color": point["color"],
        }

    except Exception as e:
        print(f"[WeatherService] Ошибка запроса для {point['name']} "
              f"({point['lat']}, {point['lon']}): {e}")
        return None


async def get_live_wind_grid(
    center_lat: float,
    center_lon: float
) -> List[Dict]:
    """
    Основная функция: получить реальные данные ветра для 4 точек вокруг центра.

    1. Генерирует 4 точки Bounding Box (NW, NE, SW, SE).
    2. Отправляет 4 параллельных HTTP-запроса к Open-Meteo через asyncio.gather.
    3. Фильтрует неудачные запросы (None) и возвращает массив станций.

    Returns:
        List[Dict] — массив объектов, совместимых с контрактом WindSystem:
            { name, lat, lon, azimuth_deg, speed_ms, color }
    """
    grid_points = _generate_grid_points(center_lat, center_lon)
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)

    async with aiohttp.ClientSession(timeout=timeout) as session:
        # asyncio.gather запускает все 4 запроса ПАРАЛЛЕЛЬНО
        results = await asyncio.gather(
            *[_fetch_weather_for_point(session, pt) for pt in grid_points],
            return_exceptions=False,
        )

    # Отфильтровываем None (неудачные запросы)
    stations = [r for r in results if r is not None]

    return stations
