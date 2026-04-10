import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mapGeoToLocal } from '../utils/geo';
import WindSystem from './WindSystem';

// Фейковые границы геометрии (в реальном проекте они должны приходить с бэкенда Terrain API)
const MAP_BOUNDS = { minLat: 40, maxLat: 42, minLon: 30, maxLon: 32 };
const TERRAIN_SIZE = 200; // Должно совпадать с args={[200, 200, ...]} в Terrain.jsx

const WeatherEffects = ({ weatherData, layers, heightData, resolution, zScale }) => {
  const { scene } = useThree();

  // Функция для получения точной Y-высоты рельефа в координатах X, Z
  const getTerrainHeight = (localX, localZ) => {
    if (!heightData || !resolution) return 0;
    
    const [width, height] = resolution;
    const halfSize = TERRAIN_SIZE / 2;
    
    // Переводим от -100..100 к индексам массива 0..255
    const percentX = (localX + halfSize) / TERRAIN_SIZE;
    // Z ось от -100 (север, верх массива) до +100 (юг, низ массива). 
    // Поскольку индекс 0 - это начало массива, localZ=-halfSize должно давать 0.
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
  // Применяем туман на всю сцену Three.js при наличии данных и активном слое слоя
  useEffect(() => {
    if (weatherData?.fog && layers.fog) {
      // Снижен множитель до 0.015, чтобы рельеф был виден даже при 100% плотности
      // Изменен цвет тумана на атмосферный синевато-серый (сланец), чтобы не "слепить" белым светом
      const density = (weatherData.fog.density_percent / 100) * 0.015;
      scene.fog = new THREE.FogExp2(0x64748b, density);
    } else {
      scene.fog = null;
    }
    // Очистка при размонтировании
    return () => { scene.fog = null; };
  }, [weatherData?.fog, scene, layers.fog]);

  return (
    <>
      {/* 2. ВЕТЕР — Физически-достоверная система частиц с привязкой к рельефу */}
      <WindSystem
        windData={weatherData?.wind}
        terrainMatrix={heightData}
        terrainSize={resolution?.[0] ?? 256}
        zScale={zScale}
        visible={layers.wind}
      />

      {/* 3. Рендер землетрясений (только если слой включен) */}
      {layers.earthquakes && weatherData?.earthquakes?.map((eq, idx) => {
        // Проекция Geo в Local
        const { x, z } = mapGeoToLocal(
          eq.lat, eq.lon, 
          MAP_BOUNDS.minLat, MAP_BOUNDS.maxLat, 
          MAP_BOUNDS.minLon, MAP_BOUNDS.maxLon, 
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
