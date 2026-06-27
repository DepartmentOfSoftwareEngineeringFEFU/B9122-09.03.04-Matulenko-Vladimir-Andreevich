import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mapGeoToLocal } from '../utils/geo';
import WindSystem from './WindSystem';
import FogLayer from './FogLayer';

// Фоллбэк-границы (используются если бэкенд не вернул tile_bounds)
const DEFAULT_BOUNDS = { minLat: 40, maxLat: 42, minLon: 30, maxLon: 32 };
const TERRAIN_SIZE = 200;

/**
 * WeatherEffects — рендеринг атмосферных явлений поверх 3D-рельефа.
 */
const WeatherEffects = ({
  weatherData,
  layers,
  heightData,
  resolution,
  zScale,
  tileBounds,
  terrainMeta,
  tileImage,
  tileCoverage,
  activeWindStations,
  isLiveLoading,
  liveError,
}) => {

  const mapBounds = tileBounds || DEFAULT_BOUNDS;

  const getTerrainHeight = (localX, localZ) => {
    if (!heightData || !resolution) return 0;

    const [width, height] = resolution;
    const halfSize = TERRAIN_SIZE / 2;

    const percentX = (localX + halfSize) / TERRAIN_SIZE;
    const percentZ = (localZ + halfSize) / TERRAIN_SIZE;

    let ix = Math.floor(percentX * (width - 1));
    let iz = Math.floor(percentZ * (height - 1));

    ix = Math.max(0, Math.min(width - 1, ix));
    iz = Math.max(0, Math.min(height - 1, iz));

    return heightData[iz * width + ix] * zScale;
  };

  return (
    <>
      {layers.fog && (
        <FogLayer
          fogData={weatherData?.fog}
          zScale={zScale}
          terrainMeta={terrainMeta}
          tileImage={tileImage}
          tileCoverage={tileCoverage}
          mapBounds={mapBounds}
        />
      )}

      {!isLiveLoading && (activeWindStations || weatherData?.wind) && (
        <WindSystem
          windStations={activeWindStations}
          windDataLegacy={weatherData?.wind}
          terrainMatrix={heightData}
          terrainSize={resolution?.[0] ?? 256}
          zScale={zScale}
          visible={layers.wind}
          mapBounds={mapBounds}
        />
      )}

      {layers.earthquakes && weatherData?.earthquakes?.map((eq, idx) => {
        const { x, z } = mapGeoToLocal(
          eq.lat, eq.lon,
          mapBounds.minLat, mapBounds.maxLat,
          mapBounds.minLon, mapBounds.maxLon,
          TERRAIN_SIZE
        );
        const heightY = getTerrainHeight(x, z);
        return <EarthquakeMarker key={idx} data={eq} localX={x} localY={heightY} localZ={z} />;
      })}
    </>
  );
};

const EarthquakeMarker = ({ data, localX, localY, localZ }) => {
  const ringsRef = useRef();
  const baseScale = data.magnitude * 2;

  useFrame((state) => {
    if (ringsRef.current) {
      const time = state.clock.getElapsedTime();
      const pulse = (Math.sin(time * 3) + 1) / 2;
      const scale = baseScale + pulse * data.magnitude;
      ringsRef.current.scale.set(scale, scale, scale);
      if (ringsRef.current.material) {
        ringsRef.current.material.opacity = 1 - pulse;
      }
    }
  });

  return (
    <group position={[localX, localY, localZ]}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1 + data.magnitude * 0.2, 16, 16]} />
        <meshBasicMaterial color="#ef4444" fog={false} />
      </mesh>
      <mesh ref={ringsRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 32]} />
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
