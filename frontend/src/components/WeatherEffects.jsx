import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mapGeoToLocal } from '../utils/geo';
import WindSystem from './WindSystem';

// Фоллбэк-границы (используются если бэкенд не вернул tile_bounds)
const DEFAULT_BOUNDS = { minLat: 40, maxLat: 42, minLon: 30, maxLon: 32 };
const TERRAIN_SIZE = 200; // Должно совпадать с args={[200, 200, ...]} в Terrain.jsx

// Координаты по умолчанию для запроса live-данных (Владивосток)
const DEFAULT_LIVE_LAT = 43.05;
const DEFAULT_LIVE_LON = 131.89;

const WeatherEffects = ({ weatherData, layers, heightData, resolution, zScale, tileBounds }) => {
  const { scene } = useThree();

  // Используем реальные границы тайла (из API) или фоллбэк
  const mapBounds = tileBounds || DEFAULT_BOUNDS;

  // ================================================================
  // LIVE WEATHER: состояние для данных реального ветра с Open-Meteo
  // ================================================================
  const [liveWindStations, setLiveWindStations] = useState(null);
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);

  /**
   * fetchLiveWeather — Запрос реальных данных ветра с нашего бэкенда.
   * Бэкенд проксирует запрос к Open-Meteo API, генерируя 4 виртуальные
   * метеостанции (Bounding Box) вокруг заданной точки.
   */
  const fetchLiveWeather = async (lat, lon) => {
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
      console.error('[WeatherEffects] Ошибка загрузки live-данных:', err.message);
      setLiveError(err.message);
    } finally {
      setIsLiveLoading(false);
    }
  };

  // Запрос live-данных при монтировании (координаты по умолчанию)
  useEffect(() => {
    fetchLiveWeather(DEFAULT_LIVE_LAT, DEFAULT_LIVE_LON);
  }, []);

  // Функция для получения точной Y-высоты рельефа в координатах X, Z
  const getTerrainHeight = (localX, localZ) => {
    if (!heightData || !resolution) return 0;
    
    const [width, height] = resolution;
    const halfSize = TERRAIN_SIZE / 2;
    
    // Переводим от -100..100 к индексам массива 0..255
    const percentX = (localX + halfSize) / TERRAIN_SIZE;
    const percentZ = (localZ + halfSize) / TERRAIN_SIZE; 
    
    let ix = Math.floor(percentX * (width - 1));
    let iz = Math.floor(percentZ * (height - 1));
    
    // Ограничиваем пределы
    ix = Math.max(0, Math.min(width - 1, ix));
    iz = Math.max(0, Math.min(height - 1, iz));
    
    // Читаем из 1D массива и умножаем на zScale
    return heightData[iz * width + ix] * zScale;
  };

  // 1. ТУМАН
  useEffect(() => {
    if (weatherData?.fog && layers.fog) {
      const density = (weatherData.fog.density_percent / 100) * 0.015;
      scene.fog = new THREE.FogExp2(0x64748b, density);
    } else {
      scene.fog = null;
    }
    return () => { scene.fog = null; };
  }, [weatherData?.fog, scene, layers.fog]);

  // Определяем источник данных ветра:
  // Приоритет: 1) wind_stations из загруженного JSON файла
  //            2) live-данные с Open-Meteo (фоновый запрос)
  //            3) legacy формат wind (одиночный вектор)
  const activeWindStations = weatherData?.wind_stations || liveWindStations;
  const activeLegacyWind = weatherData?.wind_stations ? null : (weatherData?.wind || null);

  return (
    <>
      {/* 2. ВЕТЕР — IDW интерполяция от нескольких метеостанций */}
      {!isLiveLoading && (
        <WindSystem
          windStations={activeWindStations}
          windDataLegacy={activeLegacyWind}
          terrainMatrix={heightData}
          terrainSize={resolution?.[0] ?? 256}
          zScale={zScale}
          visible={layers.wind}
          mapBounds={mapBounds}
        />
      )}

      {/* 3. Рендер землетрясений (только если слой включен) */}
      {layers.earthquakes && weatherData?.earthquakes?.map((eq, idx) => {
        // Проекция Geo в Local
        const { x, z } = mapGeoToLocal(
          eq.lat, eq.lon, 
          mapBounds.minLat, mapBounds.maxLat, 
          mapBounds.minLon, mapBounds.maxLon, 
          TERRAIN_SIZE
        );
        // Получение Y высоты рельефа, чтобы эпицентр был четко на поверхности горы
        const heightY = getTerrainHeight(x, z);

        return <EarthquakeMarker key={idx} data={eq} localX={x} localY={heightY} localZ={z} />;
      })}
    </>
  );
};

// Внутренний компонент для анимации одного эпицентра землетрясения
const EarthquakeMarker = ({ data, localX, localY, localZ }) => {
  const ringsRef = useRef();
  
  // Базовый масштаб зависит от магнитуды
  const baseScale = data.magnitude * 2;

  useFrame((state) => {
    if (ringsRef.current) {
      // Пульсация колец. Используем синусоиду от течения времени.
      // (Math.sin(...) + 1) / 2 нормализует синусоиду в диапазон от 0 до 1.
      const time = state.clock.getElapsedTime();
      const pulse = (Math.sin(time * 3) + 1) / 2;
      
      // Меняем масштаб колец для создания эффекта "ударной волны"
      const scale = baseScale + pulse * data.magnitude;
      ringsRef.current.scale.set(scale, scale, scale);
      
      // Уменьшаем прозрачность по мере роста (эффект затухания волны)
      if (ringsRef.current.material) {
        ringsRef.current.material.opacity = 1 - pulse;
      }
    }
  });

  return (
    // Группа размещается в переведенных X и Z, а Y равен высоте рельефа в данной точке
    <group position={[localX, localY, localZ]}>
      {/* Центр эпицентра - непрозрачная красная сфера */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1 + data.magnitude * 0.2, 16, 16]} />
        {/* fog={false} гарантирует, что землетрясение всегда будет ярким и не побледнеет в тумане */}
        <meshBasicMaterial color="#ef4444" fog={false} />
      </mesh>
      
      {/* Сейсмическая волна - расходящееся кольцо */}
      <mesh ref={ringsRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 32]} />
        {/* КРИТИЧНО: depthTest=false позволяет волнам быть видимыми сквозь горы (рельеф) */}
        <meshBasicMaterial 
          color="#ef4444" 
          transparent 
          opacity={0.8} 
          depthTest={false} 
          side={THREE.DoubleSide} 
          fog={false}
        />
      </mesh>
    </group>
  );
};

export default WeatherEffects;
