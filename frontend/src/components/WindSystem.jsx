import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { mapGeoToLocal } from '../utils/geo';


const TERRAIN_SIZE = 200;
const PARTICLE_COUNT = 6000;
const HALF_SIZE = TERRAIN_SIZE / 2;
const FLY_ALTITUDE = 1.5;
const VISUAL_SPEED_MULTIPLIER = 3;
const GRADIENT_INFLUENCE = 8.0;
const TURBULENCE_AMPLITUDE = 4.0;
const GRADIENT_STEP = 2.0;
const STREAK_LENGTH = 8.0;
const MAX_AGE = 150;

// Палитра цветов для станций (до 8 станций)
const STATION_COLORS = [
  new THREE.Color(0x00bfff),  // Голубой (DeepSkyBlue)
  new THREE.Color(0xff6b6b),  // Коралловый
  new THREE.Color(0x51cf66),  // Зелёный
  new THREE.Color(0xffd43b),  // Жёлтый
  new THREE.Color(0xcc5de8),  // Фиолетовый
  new THREE.Color(0xff922b),  // Оранжевый
  new THREE.Color(0x20c997),  // Бирюзовый
  new THREE.Color(0xf06595),  // Розовый
];



function getTerrainHeight(x, z, terrainMatrix, matrixSize, zScale) {
  if (!terrainMatrix || !matrixSize) return null;
  const percentX = (x + HALF_SIZE) / TERRAIN_SIZE;
  const percentZ = (z + HALF_SIZE) / TERRAIN_SIZE;
  const col = Math.max(0, Math.min(matrixSize - 1, Math.floor(percentX * (matrixSize - 1))));
  const row = Math.max(0, Math.min(matrixSize - 1, Math.floor(percentZ * (matrixSize - 1))));
  return terrainMatrix[row * matrixSize + col] * zScale;
}

function getTerrainGradient(x, z, terrainMatrix, matrixSize, zScale) {
  if (!terrainMatrix) return { gx: 0, gz: 0 };
  const step = GRADIENT_STEP;
  const hR = getTerrainHeight(x + step, z, terrainMatrix, matrixSize, zScale) ?? 0;
  const hL = getTerrainHeight(x - step, z, terrainMatrix, matrixSize, zScale) ?? 0;
  const hF = getTerrainHeight(x, z + step, terrainMatrix, matrixSize, zScale) ?? 0;
  const hB = getTerrainHeight(x, z - step, terrainMatrix, matrixSize, zScale) ?? 0;
  return { gx: -(hR - hL) / (2 * step), gz: -(hF - hB) / (2 * step) };
}



const WindSystem = ({ windStations, windDataLegacy, terrainMatrix, terrainSize, zScale, visible, mapBounds }) => {
  const linesRef = useRef();
  const noise3D = useMemo(() => createNoise3D(), []);


  const localStations = useMemo(() => {
    if (windStations && windStations.length > 0 && mapBounds) {
      return windStations.map((st, idx) => {
        const { x, z } = mapGeoToLocal(
          st.lat, st.lon,
          mapBounds.minLat, mapBounds.maxLat,
          mapBounds.minLon, mapBounds.maxLon,
          TERRAIN_SIZE
        );
        const azRad = (st.azimuth_deg * Math.PI) / 180;
        const vx = Math.sin(azRad) * st.speed_ms * VISUAL_SPEED_MULTIPLIER;
        const vz = Math.cos(azRad) * st.speed_ms * VISUAL_SPEED_MULTIPLIER;
        const color = st.color ? new THREE.Color(st.color) : STATION_COLORS[idx % STATION_COLORS.length];
        return { x, z, vx, vz, color };
      });
    }

    if (windDataLegacy) {
      const azRad = (windDataLegacy.azimuth_deg * Math.PI) / 180;
      const vx = Math.sin(azRad) * windDataLegacy.speed_ms * VISUAL_SPEED_MULTIPLIER;
      const vz = Math.cos(azRad) * windDataLegacy.speed_ms * VISUAL_SPEED_MULTIPLIER;
      return [{ x: 0, z: 0, vx, vz, color: STATION_COLORS[0] }];
    }

    return null;
  }, [windStations, windDataLegacy, mapBounds]);


  const { positions, colors, ages } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 2 * 3);  // x,y,z × 2 точки × N
    const col = new Float32Array(PARTICLE_COUNT * 2 * 3);  // r,g,b × 2 точки × N
    const ag = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i6 = i * 6;
      const hx = (Math.random() - 0.5) * TERRAIN_SIZE;
      const hz = (Math.random() - 0.5) * TERRAIN_SIZE;
      pos[i6] = hx;  pos[i6 + 1] = 0;  pos[i6 + 2] = hz;
      pos[i6 + 3] = hx;  pos[i6 + 4] = 0;  pos[i6 + 5] = hz;

      // Начальный белый цвет (будет перезаписан в useFrame)
      col[i6] = 1;  col[i6 + 1] = 1;  col[i6 + 2] = 1;
      col[i6 + 3] = 1;  col[i6 + 4] = 1;  col[i6 + 5] = 1;

      ag[i] = Math.random() * MAX_AGE;
    }

    return { positions: pos, colors: col, ages: ag };
  }, []);


  useFrame((state, delta) => {
    if (!linesRef.current || !localStations || !terrainMatrix) return;

    const posArray = linesRef.current.geometry.attributes.position.array;
    const colArray = linesRef.current.geometry.attributes.color.array;
    const time = state.clock.getElapsedTime();
    const stationCount = localStations.length;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i6 = i * 6;


      ages[i] += 1;
      if (ages[i] >= MAX_AGE) {
        ages[i] = 0;
        const newX = (Math.random() - 0.5) * TERRAIN_SIZE;
        const newZ = (Math.random() - 0.5) * TERRAIN_SIZE;
        const newY = (getTerrainHeight(newX, newZ, terrainMatrix, terrainSize, zScale) ?? 0) + FLY_ALTITUDE;
        posArray[i6] = newX;  posArray[i6 + 1] = newY;  posArray[i6 + 2] = newZ;
        posArray[i6 + 3] = newX;  posArray[i6 + 4] = newY;  posArray[i6 + 5] = newZ;
        continue;
      }

      let px = posArray[i6];
      let pz = posArray[i6 + 2];


      let sumVx = 0, sumVz = 0, sumWeights = 0;
      let maxWeight = -1;
      let dominantIdx = 0;

      for (let s = 0; s < stationCount; s++) {
        const st = localStations[s];
        const dx = px - st.x;
        const dz = pz - st.z;
        let distSq = dx * dx + dz * dz;
        distSq = Math.max(distSq, 0.0001);

        const weight = 1.0 / distSq;
        sumVx += st.vx * weight;
        sumVz += st.vz * weight;
        sumWeights += weight;

        if (weight > maxWeight) {
          maxWeight = weight;
          dominantIdx = s;
        }
      }

      let vx = sumVx / sumWeights;
      let vz = sumVz / sumWeights;


      const stColor = localStations[dominantIdx].color;
      colArray[i6]     = stColor.r;
      colArray[i6 + 1] = stColor.g;
      colArray[i6 + 2] = stColor.b;
      colArray[i6 + 3] = stColor.r;
      colArray[i6 + 4] = stColor.g;
      colArray[i6 + 5] = stColor.b;


      const gradient = getTerrainGradient(px, pz, terrainMatrix, terrainSize, zScale);
      vx += gradient.gx * GRADIENT_INFLUENCE;
      vz += gradient.gz * GRADIENT_INFLUENCE;

      const noiseX = noise3D(px * 0.02, pz * 0.02, time * 0.3);
      const noiseZ = noise3D(px * 0.02 + 100.0, pz * 0.02 + 100.0, time * 0.3);
      vx += noiseX * TURBULENCE_AMPLITUDE;
      vz += noiseZ * TURBULENCE_AMPLITUDE;

      px += vx * delta;
      pz += vz * delta;
      if (px > HALF_SIZE)  px -= TERRAIN_SIZE;
      if (px < -HALF_SIZE) px += TERRAIN_SIZE;
      if (pz > HALF_SIZE)  pz -= TERRAIN_SIZE;
      if (pz < -HALF_SIZE) pz += TERRAIN_SIZE;

      const headY = (getTerrainHeight(px, pz, terrainMatrix, terrainSize, zScale) ?? 0) + FLY_ALTITUDE;
      posArray[i6] = px;  posArray[i6 + 1] = headY;  posArray[i6 + 2] = pz;

      const tailX = px - vx * delta * STREAK_LENGTH;
      const tailZ = pz - vz * delta * STREAK_LENGTH;
      const tailY = (getTerrainHeight(tailX, tailZ, terrainMatrix, terrainSize, zScale) ?? 0) + FLY_ALTITUDE;
      posArray[i6 + 3] = tailX;  posArray[i6 + 4] = tailY;  posArray[i6 + 5] = tailZ;
    }

    posArray.needsUpdate = true;
    linesRef.current.geometry.attributes.position.needsUpdate = true;
    linesRef.current.geometry.attributes.color.needsUpdate = true;
  });

  if (!visible || !localStations) return null;

  return (
    <lineSegments ref={linesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={PARTICLE_COUNT * 2}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={PARTICLE_COUNT * 2}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors={true}
        transparent
        opacity={0.8}
        depthWrite={false}
        fog={true}
      />
    </lineSegments>
  );
};

export default WindSystem;
