import httpx
import asyncio
import json

async def run_test():
    url = "http://127.0.0.1:8000/api/v1/simulation/process"
    
    print(f"Отправка запроса на {url}...")
    
    # Открываем наш обновленный тестовый JSON файл
    with open("weather_test.json", "rb") as f:
        files = {"file": ("weather_test.json", f, "application/json")}
        
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                response = await client.post(url, files=files)
                print(f"Статус ответa: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Проверяем успешность данных рельефа
                    terrain = data.get("terrain", {})
                    weather = data.get("weather", {})
                    
                    print("\n--- ДАННЫЕ О РЕЛЬЕФЕ (AWS S3) ---")
                    print(f"Размер тайла: {terrain.get('size')}x{terrain.get('size')}")
                    print(f"Истинная минимальная высота: {terrain.get('min_height_meters'):.2f} метров")
                    print(f"Истинная максимальная высота: {terrain.get('max_height_meters'):.2f} метров")
                    print(f"Количество точек в матрице: {len(terrain.get('matrix', []))}")
                    print(f"Первые 5 нормализованных значений: {terrain.get('matrix', [])[:5]}")
                    
                    print("\n--- МЕТЕОДАННЫЕ ---")
                    print(f"Центр проекции: {weather.get('metadata', {}).get('center_lat')}, {weather.get('metadata', {}).get('center_lon')}")
                    print(f"Количество землетрясений: {len(weather.get('earthquakes', []))}")
                else:
                    print(f"Ошибка: {response.text}")
                    
            except Exception as e:
                print(f"Произошла ошибка при подключении (возможно сервер выключен): {e}")

if __name__ == "__main__":
    asyncio.run(run_test())