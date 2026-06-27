import React, { useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Sidebar from './components/Sidebar';
import Terrain from './components/Terrain';
import WeatherEffects from './components/WeatherEffects';

// Координаты по умолчанию (Владивосток) — используются до загрузки файла
const DEFAULT_LIVE_LAT = 43.05;
const DEFAULT_LIVE_LON = 131.89;

function App() {
  const [heightData, setHeightData] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [resolution, setResolution] = useState([256, 256]);
  const [zScale, setZScale] = useState(10);
  const [wireframe, setWireframe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tileImage, setTileImage] = useState(null);
  const [tileCoverage, setTileCoverage] = useState(null);
  const [terrainMeta, setTerrainMeta] = useState(null);
  const [tileBounds, setTileBounds] = useState(null);

  // ================================================================
  // LIVE WEATHER — поднято из WeatherEffects, чтобы Sidebar мог
  // отображать сводку по текущим метеостанциям
  // ================================================================
  const [liveWindStations, setLiveWindStations] = useState(null);
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);

  /**
   * fetchLiveWeather — запрашивает реальный ветер для заданных координат.
   * Оборачиваем в useCallback, чтобы ссылка не пересоздавалась при каждом рендере.
   */
  const fetchLiveWeather = useCallback(async (lat, lon) => {
    setIsLiveLoading(true);
    setLiveError(null);
    try {
      const response = await fetch(
        `http://localhost:8000/api/weather/live?lat=${lat}&lon=${lon}`
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setLiveWindStations(data.wind_stations);
    } catch (err) {
      console.error('[App] Ошибка live-данных:', err.message);
      setLiveError(err.message);
    } finally {
      setIsLiveLoading(false);
    }
  }, []);

  // Запрашиваем ветер при смене координат карты (или при первом рендере)
  const centerLat = weatherData?.metadata?.center_lat ?? DEFAULT_LIVE_LAT;
  const centerLon = weatherData?.metadata?.center_lon ?? DEFAULT_LIVE_LON;

  const hasCustomWind = weatherData?.wind_stations?.length > 0 || weatherData?.wind;
  const displayWindStations = hasCustomWind ? weatherData?.wind_stations : liveWindStations;
  const dataSourceMode = hasCustomWind ? 'custom' : 'live';

  useEffect(() => {
    if (hasCustomWind) {
      setIsLiveLoading(false);
      setLiveError(null);
      return;
    }
    fetchLiveWeather(centerLat, centerLon);
  }, [centerLat, centerLon, fetchLiveWeather, hasCustomWind]);

  // Стейт менеджера слоев
  const [layers, setLayers] = useState({
    terrain: true,
    fog: true,
    wind: true,
    earthquakes: true
  });

  // Единая логика для отправки метеоданных и получения автоматической загрузки рельефа
  const handleSimulationUpload = async (file) => {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/api/v1/simulation/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(JSON.stringify(errorData.detail) || 'Ошибка при загрузке данных симуляции');
      }

      const data = await response.json();

      setHeightData(data.terrain.matrix);
      setResolution([data.terrain.size, data.terrain.size]);
      setTileImage(data.terrain.image_base64);
      setTileCoverage(data.terrain.tile_width_km);
      setTerrainMeta({
        minMeters: data.terrain.min_height_meters,
        maxMeters: data.terrain.max_height_meters,
      });
      setTileBounds(data.terrain.tile_bounds);
      setWeatherData(data.weather);

    } catch (err) {
      console.error(err);
      setError(`Ошибка симуляции: ${err.message}`);
      alert(`Ошибка: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-900 text-white overflow-hidden">
      {/* Боковая панель — теперь получает terrainMeta и liveWindStations для легенд */}
      <Sidebar
        onUpload={handleSimulationUpload}
        zScale={zScale}
        setZScale={setZScale}
        wireframe={wireframe}
        setWireframe={setWireframe}
        loading={loading}
        layers={layers}
        setLayers={setLayers}
        tileImage={tileImage}
        tileCoverage={tileCoverage}
        terrainMeta={terrainMeta}
        liveWindStations={displayWindStations}
        dataSourceMode={dataSourceMode}
        isLiveLoading={isLiveLoading}
        liveError={liveError}
        weatherData={weatherData}
      />

      {/* Основной контейнер для 3D сцены */}
      <div className="flex-1 relative">
        <Canvas camera={{ position: [0, 150, 200], fov: 60 }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[100, 100, 50]} intensity={1.5} />
          <directionalLight position={[-100, 50, -50]} intensity={0.5} />
          <OrbitControls makeDefault />

          {layers.terrain && (
            <Terrain
              heightData={heightData}
              resolution={resolution}
              zScale={zScale}
              wireframe={wireframe}
              terrainMeta={terrainMeta}
            />
          )}

          {/* WeatherEffects теперь получает готовые данные ветра из App */}
          <WeatherEffects
            weatherData={weatherData}
            layers={layers}
            heightData={heightData}
            resolution={resolution}
            zScale={zScale}
            tileBounds={tileBounds}
            terrainMeta={terrainMeta}
            tileImage={tileImage}
            tileCoverage={tileCoverage}
            activeWindStations={displayWindStations}
            isLiveLoading={isLiveLoading}
            liveError={liveError}
          />
        </Canvas>

        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500/90 text-white px-6 py-3 rounded shadow-lg z-50 transition-all font-medium">
            ⚠️ {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
