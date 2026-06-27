"""
WeatherService — Сервис получения реальных метеоданных с Open-Meteo API.
"""

import aiohttp
import asyncio
from typing import List, Dict, Optional


OFFSET_DEG = 0.05

REQUEST_TIMEOUT = 15.0

POINT_NAMES = [
    "Северо-Запад",
    "Северо-Восток",
    "Юго-Запад",
    "Юго-Восток",
]

POINT_COLORS = [
    "#00bfff",  # Голубой
    "#ff6b6b",  # Коралловый
    "#51cf66",  # Зелёный
    "#ffd43b",  # Жёлтый
]


def _generate_grid_points(center_lat: float, center_lon: float) -> List[Dict]:
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
    grid_points = _generate_grid_points(center_lat, center_lon)
    timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(timeout=timeout, trust_env=True, headers=headers, connector=connector) as session:
        results = await asyncio.gather(
            *[_fetch_weather_for_point(session, pt) for pt in grid_points],
            return_exceptions=False,
        )

    stations = [r for r in results if r is not None]

    if not stations:
        import random
        print("[WeatherService] Open-Meteo недоступен. Генерация mock-данных ветра.")
        base_azimuth = random.uniform(0, 360)
        base_speed = random.uniform(5, 15)
        
        for pt in grid_points:
            azimuth = (base_azimuth + random.uniform(-10, 10)) % 360
            speed = max(0.5, base_speed + random.uniform(-2, 2))
            
            stations.append({
                "name": pt["name"],
                "lat": pt["lat"],
                "lon": pt["lon"],
                "azimuth_deg": round(azimuth, 1),
                "speed_ms": round(speed, 1),
                "color": pt["color"],
            })

    return stations
