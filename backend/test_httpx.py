import aiohttp
import asyncio

async def test():
    url = "https://api.open-meteo.com/v1/forecast"
    params = {"latitude": 43.11, "longitude": 131.88, "current_weather": "true"}
    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params, timeout=timeout) as r:
            d = await r.json()
            print("STATUS:", r.status)
            print("WIND:", d.get("current_weather", {}))

asyncio.run(test())
