import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// ============================================================
// ВЕРШИННЫЙ ШЕЙДЕР
// Передаёт UV для чтения карты высот и шумовой маски.
// ============================================================
const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ============================================================
// ФРАГМЕНТНЫЙ ШЕЙДЕР
//
// Архитектура (без DepthTexture):
//   1. FBM Value Noise — клубящиеся пятна, медленно плывущие по карте.
//   2. Terrain-RGB пересечения — читаем AWS-текстуру по vUv,
//      декодируем высоту (Mapbox Terrain-RGB формула),
//      сравниваем с uTopHeight → heightFade.
//   3. Радиальная маска — ограничивает туман кругом вокруг
//      uFogCenterUv с мягким затуханием на границе.
//   4. Краевой фейд — убирает прямоугольное обрезание плоскости.
// ============================================================
const fragmentShader = `
  uniform float uTime;
  uniform float uDensity;
  uniform vec3  uColor;
  uniform sampler2D uHeightmap;
  uniform float uTopHeight;     // Высота верхней границы тумана (метры)
  uniform vec2  uFogCenterUv;   // UV-координаты центра тумана
  uniform float uFogRadiusUv;   // Радиус тумана в UV-пространстве

  varying vec2 vUv;

  // ----------------------------------------------------------
  // Value Noise (без lookup-таблиц, всё вычислительно)
  // ----------------------------------------------------------
  float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Фрактальный (FBM) шум — 5 октав для детализации клубов
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 5; i++) {
      value += amplitude * valueNoise(p * frequency);
      amplitude *= 0.5;
      frequency *= 2.1;
    }
    return value;
  }

  void main() {
    // ============================================================
    // 1. ШУМОВАЯ МАСКА (два слоя с разной скоростью → завихрение)
    // ============================================================
    vec2 uv1 = vUv * 3.0 + vec2(uTime * 0.04, uTime * 0.025);
    vec2 uv2 = vUv * 2.0 - vec2(uTime * 0.03, uTime * 0.015);

    float noise1 = fbm(uv1);
    float noise2 = fbm(uv2);
    float noiseMask = noise1 * 0.6 + noise2 * 0.4;
    noiseMask = smoothstep(0.28, 0.72, noiseMask);

    // ============================================================
    // 2. ВЫСОТНОЕ ПЕРЕСЕЧЕНИЕ (Terrarium → метры)
    //
    // Декодирование Mapzen Terrarium:
    //   height = (R * 256.0 + G + B / 256.0) - 32768.0
    // Где R,G,B в диапазоне [0, 255] (texture2D возвращает [0,1],
    // поэтому умножаем на 255.0).
    // ============================================================
    vec4 texColor = texture2D(uHeightmap, vUv);
    float R = texColor.r * 255.0;
    float G = texColor.g * 255.0;
    float B = texColor.b * 255.0;
    float terrainHeight = (R * 256.0) + G + (B / 256.0) - 32768.0;

    // Разница: положительная = туман выше рельефа, отрицательная = гора пробивает туман
    float delta = uTopHeight - terrainHeight;

    // Градиент пересечения: 0 = гора выше тумана, 1 = туман выше (плоскость)
    // 20 метров = ширина зоны мягкого перехода
    float heightFade = smoothstep(0.0, 20.0, delta);

    // ============================================================
    // 3. РАДИАЛЬНАЯ МАСКА (ограничение тумана по области)
    // ============================================================
    float distToCenter = distance(vUv, uFogCenterUv);
    float radialMask = 1.0 - smoothstep(uFogRadiusUv * 0.5, uFogRadiusUv, distToCenter);

    // ============================================================
    // 4. КРАЕВОЙ ФЕЙД (убирает прямоугольник плоскости)
    // ============================================================
    vec2 centeredUV = abs(vUv - 0.5) * 2.0;
    float edgeFade = 1.0 - smoothstep(0.7, 1.0, max(centeredUV.x, centeredUV.y));

    // ============================================================
    // 5. ФИНАЛЬНАЯ ПРОЗРАЧНОСТЬ
    // ============================================================
    float finalAlpha = uDensity * noiseMask * heightFade * radialMask * edgeFade;
    finalAlpha = clamp(finalAlpha, 0.0, 0.88);

    if (finalAlpha < 0.01) discard;

    gl_FragColor = vec4(uColor, finalAlpha);
  }
`;

// ============================================================
// Вспомогательные функции
// ============================================================
const hexToThreeColor = (hex) => {
  try { return new THREE.Color(hex); }
  catch { return new THREE.Color('#e0e6ed'); }
};

/**
 * Конвертация географических координат (lat, lon) в UV-пространство
 * текстуры Terrain-RGB (0,0 = юго-запад; 1,1 = северо-восток).
 */
const geoToUv = (lat, lon, bounds) => {
  if (!bounds) return { u: 0.5, v: 0.5 };
  const u = (lon - bounds.minLon) / (bounds.maxLon - bounds.minLon);
  // V инвертирован: в текстуре 0 = верх (север), 1 = низ (юг)
  // Но planeGeometry по умолчанию: UV(0,0) = нижний-левый
  // Поэтому v = (lat - minLat) / (maxLat - minLat)
  const v = (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat);
  return {
    u: Math.max(0, Math.min(1, u)),
    v: Math.max(0, Math.min(1, v)),
  };
};

// ============================================================
// FogLayer — компонент шейдерного низинного тумана
//
// Архитектура:
//   - Использует Terrain-RGB текстуру (AWS) для пересечений
//   - Не использует DepthTexture / useDepthBuffer
//   - frustumCulled = false для стабильности
//   - Радиальная маска ограничивает область тумана
// ============================================================
const FogLayer = ({ fogData, zScale, terrainMeta, tileImage, tileCoverage, mapBounds }) => {
  const meshRef = useRef();
  const matRef  = useRef();

  // ----------------------------------------------------------
  // Создаём THREE.Texture из base64 Terrain-RGB тайла
  // ----------------------------------------------------------
  const heightmapTexture = useMemo(() => {
    if (!tileImage) return null;

    const img = new Image();
    img.src = `data:image/png;base64,${tileImage}`;

    const tex = new THREE.Texture(img);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    img.onload = () => {
      tex.needsUpdate = true;
    };

    return tex;
  }, [tileImage]);

  // ----------------------------------------------------------
  // Нормализуем данные тумана (новый + legacy формат)
  // ----------------------------------------------------------
  const fogConfig = useMemo(() => {
    if (!fogData) return null;

    // Новый формат (density, top_height_m, color, lat, lon, radius_km)
    if (fogData.density !== undefined && fogData.density !== null) {
      return {
        density:      fogData.density,
        top_height_m: fogData.top_height_m ?? 200,
        color:        hexToThreeColor(fogData.color ?? '#e0e6ed'),
        lat:          fogData.lat ?? null,
        lon:          fogData.lon ?? null,
        radius_km:    fogData.radius_km ?? null,
      };
    }

    // Legacy формат (density_percent, layer_thickness_km)
    const density = (fogData.density_percent ?? 50) / 100;
    const top_height_m = (fogData.layer_thickness_km ?? 1.5) * 100;
    return {
      density,
      top_height_m,
      color:     hexToThreeColor('#dce8f0'),
      lat:       null,
      lon:       null,
      radius_km: null,
    };
  }, [fogData]);

  // ----------------------------------------------------------
  // Вычисляем UV-координаты центра тумана и радиус в UV
  // ----------------------------------------------------------
  const { fogCenterUv, fogRadiusUv } = useMemo(() => {
    if (!fogConfig) return { fogCenterUv: [0.5, 0.5], fogRadiusUv: 1.0 };

    // Если lat/lon/radius_km не заданы — покрываем всю карту
    if (fogConfig.lat === null || fogConfig.lon === null || fogConfig.radius_km === null) {
      return { fogCenterUv: [0.5, 0.5], fogRadiusUv: 1.0 };
    }

    const { u, v } = geoToUv(fogConfig.lat, fogConfig.lon, mapBounds);

    // tileCoverage — ширина тайла в км
    // Радиус в UV = radius_km / tileCoverage_km
    const mapSizeKm = tileCoverage || 14; // фоллбэк ~14 км для zoom=11
    const radiusUv = fogConfig.radius_km / mapSizeKm;

    return {
      fogCenterUv: [u, v],
      fogRadiusUv: Math.min(radiusUv, 1.0),
    };
  }, [fogConfig, mapBounds, tileCoverage]);

  // ----------------------------------------------------------
  // ShaderMaterial (создаём один раз)
  // ----------------------------------------------------------
  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite:  false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime:         { value: 0 },
      uDensity:      { value: 0.6 },
      uColor:        { value: new THREE.Color('#e0e6ed') },
      uHeightmap:    { value: null },
      uTopHeight:    { value: 200.0 },
      uFogCenterUv:  { value: new THREE.Vector2(0.5, 0.5) },
      uFogRadiusUv:  { value: 1.0 },
    },
  }), []);

  // ----------------------------------------------------------
  // Обновляем юниформы каждый кадр (анимация + данные)
  // ----------------------------------------------------------
  useFrame((state) => {
    if (!matRef.current || !fogConfig) return;

    const u = matRef.current.uniforms;
    u.uTime.value        = state.clock.getElapsedTime();
    u.uDensity.value     = fogConfig.density;
    u.uColor.value       = fogConfig.color;
    u.uHeightmap.value   = heightmapTexture;
    u.uTopHeight.value   = fogConfig.top_height_m;
    u.uFogCenterUv.value.set(fogCenterUv[0], fogCenterUv[1]);
    u.uFogRadiusUv.value = fogRadiusUv;
  });

  // Высота плоскости тумана в Three.js units
  const fogY = useMemo(() => {
    if (!fogConfig || !terrainMeta || terrainMeta.maxMeters <= terrainMeta.minMeters) {
      return 2; // фоллбэк
    }
    const range = terrainMeta.maxMeters - terrainMeta.minMeters;
    const normalizedHeight = (fogConfig.top_height_m - terrainMeta.minMeters) / range;
    return Math.max(0.1, normalizedHeight * zScale);
  }, [fogConfig, terrainMeta, zScale]);

  if (!fogConfig || !heightmapTexture) return null;

  return (
    <mesh
      ref={meshRef}
      position={[0, fogY, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
    >
      <planeGeometry args={[220, 220, 1, 1]} />
      <primitive ref={matRef} object={shaderMaterial} attach="material" />
    </mesh>
  );
};

export default FogLayer;
