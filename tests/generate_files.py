import json
import os

custom_dir = "custom_wind"
live_dir = "live_wind"

# Base template
def create_test_file(idx, with_custom_wind):
    lat = 43.0 + (idx * 0.01)
    lon = 131.8 + (idx * 0.01)
    
    data = {
        "metadata": {
            "center_lat": round(lat, 4),
            "center_lon": round(lon, 4),
            "zoom": 11 + (idx % 3)
        },
        "earthquakes": [
            {
                "magnitude": round(3.0 + (idx * 0.2), 1),
                "depth_km": 10 + idx,
                "lat": round(lat + 0.02, 4),
                "lon": round(lon - 0.01, 4)
            }
        ] if idx % 2 == 0 else [],
        "fog": {
            "density": 0.5 + (idx % 5) * 0.1,
            "top_height_m": 100 + (idx * 10),
            "color": "#e0e6ed"
        } if idx % 3 != 0 else None,
        "wind_stations": []
    }
    
    if with_custom_wind:
        data["wind_stations"] = [
            {
                "name": f"Станция A-{idx}",
                "lat": round(lat + 0.05, 4),
                "lon": round(lon, 4),
                "azimuth_deg": (idx * 30) % 360,
                "speed_ms": 5 + (idx % 15),
                "color": "#ff0000"
            },
            {
                "name": f"Станция B-{idx}",
                "lat": round(lat - 0.05, 4),
                "lon": round(lon + 0.05, 4),
                "azimuth_deg": (idx * 45 + 180) % 360,
                "speed_ms": 10 + (idx % 10),
                "color": "#00ff00"
            }
        ]
        
    filename = f"test_sim_{'custom' if with_custom_wind else 'live'}_{idx+1}.json"
    folder = custom_dir if with_custom_wind else live_dir
    path = os.path.join(folder, filename)
    
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

for i in range(10):
    create_test_file(i, True)

for i in range(10):
    create_test_file(i, False)

print("Created 20 test files successfully.")
