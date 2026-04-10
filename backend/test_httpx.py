import httpx
import asyncio
import traceback

async def test():
    url = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/11/1201/763.png"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            print("OK:", resp.status_code)
            print("Len:", len(resp.content))
    except Exception as e:
        print("Error type:", type(e))
        print("Error str:", str(e))
        print("Traceback:")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
