import mercantile
import numpy as np
import cv2
import base64
from fastapi import HTTPException
from typing import Dict, Any, Tuple

class TerrainService:
    @staticmethod
    async def get_elevation_matrix(lat: float, lon: float, zoom: int) -> Dict[str, Any]:
        """
        Асинхронно скачивает тайл карты высот (Terrarium) с AWS S3, декодирует его и возвращает
        массив высот в диапазоне от 0.0 до 1.0 (для совместимости с фронтендом), а также 
        исходные высоты в метрах для аналитики.
        """
        # 1. Рассчитываем координаты тайла по мировым координатам (lat, lon) и заданному zoom
        # Библиотека mercantile переводит географические координаты в формат "слиппи-карт" (XYZ)
        tile = mercantile.tile(lon, lat, zoom)
        x, y, z = tile.x, tile.y, tile.z

        # 2. Формируем URL для скачивания тайла высот формата Terrarium
        # Это открытые данные Mapzen (теперь хостятся на AWS), которые отдают рельеф закодированный в RGB.
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

        # 3. Скачиваем изображение (используем встроенный urllib, он надежнее обходит баг ConnectTimeout в async httpx на Windows)
        import urllib.request
        import urllib.error
        
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req, timeout=15.0) as response:
                image_bytes = response.read()
        except urllib.error.URLError as e:
            raise HTTPException(status_code=502, detail=f"Ошибка сети при обращении к AWS S3: {str(e.reason)} (URL: {url})")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Неизвестная ошибка: {repr(e)} (URL: {url})")
        nparr = np.frombuffer(image_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img_bgr is None:
            raise HTTPException(status_code=500, detail="Ошибка декодирования PNG тайла")

        # Кодируем обратно в Base64 для передачи на UI
        image_b64 = base64.b64encode(image_bytes).decode('utf-8')

        # 5. Математика декодирования:
        # OpenCV считывает каналы в порядке B (0), G (1), R (2).
        # Формула Terrarium для получения высоты в метрах: height = (R * 256.0 + G + B / 256.0) - 32768.0
        # Записываем каналы в отдельные переменные, преобразуя в float32 для избежания переполнения
        b = img_bgr[:, :, 0].astype(np.float32)
        g = img_bgr[:, :, 1].astype(np.float32)
        r = img_bgr[:, :, 2].astype(np.float32)

        # Выполняем векторизованную операцию над всей матрицей
        height_meters_matrix = (r * 256.0) + g + (b / 256.0) - 32768.0

        # Получаем реальные минимумы и максимумы (в метрах) для передачи на клиент.
        # Это поможет фронтенду или другим сервисам знать истинную высоту гор.
        min_meters = float(height_meters_matrix.min())
        max_meters = float(height_meters_matrix.max())

        # 6. Нормализация (Min-Max)
        # Требование: Фронтенд (Three.js) изначально разрабатывался под значения 0.0 - 1.0. 
        # Если разница высот равна нулю (вдруг открыли тайл ровного океана), избегаем деления на 0.
        height_range = max_meters - min_meters
        if height_range > 0:
            normalized_matrix = (height_meters_matrix - min_meters) / height_range
        else:
            normalized_matrix = np.zeros_like(height_meters_matrix)

        # 7. Подготавливаем результирующий словарь
        # Three.js ожидает одномерный массив (flatten) из значений от 0.0 до 1.0
        heights_list = normalized_matrix.flatten().tolist()
        
        # Обычно тайлы отдаются в размере 256x256
        tile_size = img_bgr.shape[0]

        # Расчет покрытия тайла в километрах (по формулам Web Mercator)
        import math
        equator_length_km = 40075.016
        equator_width = equator_length_km / (2 ** zoom)
        tile_width_km = equator_width * math.cos(math.radians(lat))

        # Реальные географические границы тайла (для проекции метеостанций)
        bounds = mercantile.bounds(tile)

        return {
            "matrix": heights_list,
            "size": tile_size,
            "min_height_meters": min_meters,
            "max_height_meters": max_meters,
            "image_base64": image_b64,
            "tile_width_km": round(tile_width_km, 2),
            "tile_bounds": {
                "minLat": round(bounds.south, 6),
                "maxLat": round(bounds.north, 6),
                "minLon": round(bounds.west, 6),
                "maxLon": round(bounds.east, 6)
            }
        }
