import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';

// ============================================================================
// GLSL ШЕЙДЕРЫ: Тепловая карта высот с динамическим уровнем моря
// ============================================================================

/**
 * ВЕРШИННЫЙ ШЕЙДЕР (Vertex Shader)
 * 
 * Передаёт нормализованную высоту вершины во фрагментный шейдер.
 * uMinHeight / uMaxHeight — реальные границы высот в единицах Three.js.
 */
const vertexShader = `
  uniform float uMinHeight;
  uniform float uMaxHeight;

  varying float vElevation;

  void main() {
    // position.z — высота вершины (заданная через heightData[i] * zScale)
    // Нормализуем в [0, 1]: 0 = самая низкая точка, 1 = самый высокий пик
    float range = uMaxHeight - uMinHeight;

    if (range < 0.001) {
      vElevation = 0.0;
    } else {
      vElevation = clamp((position.z - uMinHeight) / range, 0.0, 1.0);
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * ФРАГМЕНТНЫЙ ШЕЙДЕР (Fragment Shader)
 *
 * Использует ДИНАМИЧЕСКИЙ уровень моря (uSeaLevel) вместо захардкоженных порогов.
 *
 * uSeaLevel — нормализованное значение [0, 1], при котором высота = 0 метров.
 *   Вычисляется на стороне JavaScript: seaLevel = (0 - minMeters) / (maxMeters - minMeters).
 *   Например, если minMeters = -50м (подводная глубина), maxMeters = 700м:
 *     seaLevel = (0 - (-50)) / (700 - (-50)) = 50 / 750 ≈ 0.067
 *   Если minMeters = 10м (нет воды на тайле):
 *     seaLevel = (0 - 10) / (500 - 10) < 0 → clamp к 0 → водной зоны нет.
 *
 * ПАЛИТРА:
 *   [0      — sea-0.01]   Глубокая вода (тёмно-синий → бирюзовый)
 *   [sea-0.01 — sea+0.02] Мелководье / берег (бирюзовый → зелёный)
 *   [sea+0.02 — 0.45]     Низины / луга (зелёный → светло-зелёный)
 *   [0.45    — 0.75]      Склоны (светло-зелёный → коричневый)
 *   [0.75    — 1.0]       Горные пики (коричневый → снежно-белый)
 */
const fragmentShader = `
  uniform float uSeaLevel;    // Нормализованная высота уровня моря [0, 1]

  varying float vElevation;

  void main() {
    // ================================================================
    // ОПРЕДЕЛЕНИЕ ЦВЕТОВ ПАЛИТРЫ
    // ================================================================

    vec3 colorDeepWater    = vec3(0.06, 0.24, 0.47);   // Глубокая вода: тёмный синий
    vec3 colorShallowWater = vec3(0.12, 0.47, 0.63);   // Мелководье: бирюзовый
    vec3 colorLowland      = vec3(0.13, 0.55, 0.13);   // Низины: лесной зелёный
    vec3 colorMeadow       = vec3(0.49, 0.70, 0.26);   // Луга: светло-зелёный
    vec3 colorRock         = vec3(0.55, 0.41, 0.24);   // Склоны: коричневый
    vec3 colorSnow         = vec3(0.96, 0.96, 0.98);   // Пики: снежно-белый

    // ================================================================
    // ВЫЧИСЛЕНИЕ ГРАНИЦ ЗОН ОТНОСИТЕЛЬНО УРОВНЯ МОРЯ
    //
    // Все пороги привязаны к uSeaLevel, а не захардкожены.
    // Это гарантирует, что вода ВСЕГДА окрашена правильно,
    // независимо от того, есть ли в тайле батиметрия (подводная глубина).
    // ================================================================

    float seaTop    = uSeaLevel + 0.02;  // Верхняя граница прибрежной зоны
    float landLow   = seaTop;            // Начало зелёной зоны
    float landMid   = 0.45;             // Переход к склонам
    float landHigh  = 0.75;             // Начало снежной зоны

    // Гарантируем, что зелёная/склоны/снег не перекроются из-за высокого уровня моря
    landMid  = max(landMid,  seaTop + 0.05);
    landHigh = max(landHigh, landMid + 0.05);

    vec3 finalColor;

    if (vElevation < uSeaLevel) {
      // ЗОНА ВОДЫ: от минимальной глубины до уровня моря
      // smoothstep плавно переходит от глубокой воды к мелководью
      float t = smoothstep(0.0, uSeaLevel, vElevation);
      finalColor = mix(colorDeepWater, colorShallowWater, t);
    } else if (vElevation < seaTop) {
      // ПРИБРЕЖНАЯ ЗОНА: узкая полоска перехода от воды к суше
      float t = smoothstep(uSeaLevel, seaTop, vElevation);
      finalColor = mix(colorShallowWater, colorLowland, t);
    } else if (vElevation < landMid) {
      // НИЗИНЫ → ЛУГА
      float t = smoothstep(landLow, landMid, vElevation);
      finalColor = mix(colorLowland, colorMeadow, t);
    } else if (vElevation < landHigh) {
      // ЛУГА → ГОРНАЯ ПОРОДА
      float t = smoothstep(landMid, landHigh, vElevation);
      finalColor = mix(colorMeadow, colorRock, t);
    } else {
      // ГОРНАЯ ПОРОДА → СНЕГ
      float t = smoothstep(landHigh, 1.0, vElevation);
      finalColor = mix(colorRock, colorSnow, t);
    }

    // ================================================================
    // ЭКРАННОЕ ДИФФУЗНОЕ ОСВЕЩЕНИЕ (dFdx/dFdy)
    // ================================================================
    vec3 dx = dFdx(gl_FragCoord.xyz);
    vec3 dy = dFdy(gl_FragCoord.xyz);
    vec3 normal = normalize(cross(dx, dy));

    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diffuse = max(dot(normal, lightDir), 0.0);
    float lighting = 0.4 + 0.6 * diffuse;

    gl_FragColor = vec4(finalColor * lighting, 1.0);
  }
`;


// ============================================================================
// КОМПОНЕНТ Terrain
// ============================================================================

const Terrain = ({ heightData, resolution, zScale, wireframe, terrainMeta }) => {
  const meshRef = useRef();
  const geometryRef = useRef();

  const [width, height] = resolution;

  // Вычисляем min/max высот в единицах Three.js и нормализованный уровень моря
  const { minH, maxH, seaLevel } = useMemo(() => {
    if (!heightData) return { minH: 0, maxH: 1, seaLevel: 0 };

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < heightData.length; i++) {
      const v = heightData[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    // min/max в единицах Three.js (для передачи в vertex shader)
    const minScaled = min * zScale;
    const maxScaled = max * zScale;

    // Вычисляем нормализованный уровень моря (0 метров):
    // seaLevel = (0 - minMeters) / (maxMeters - minMeters)
    // Если minMeters > 0 (весь тайл выше моря) → seaLevel < 0 → clamp к 0 → воды нет
    // Если minMeters < 0 (есть подводная глубина) → seaLevel > 0 → вода видна
    let sl = 0;
    if (terrainMeta && terrainMeta.maxMeters > terrainMeta.minMeters) {
      sl = (0 - terrainMeta.minMeters) / (terrainMeta.maxMeters - terrainMeta.minMeters);
      sl = Math.max(0, Math.min(1, sl)); // clamp [0, 1]
    }

    return { minH: minScaled, maxH: maxScaled, seaLevel: sl };
  }, [heightData, zScale, terrainMeta]);

  // Создаём ShaderMaterial один раз
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uMinHeight: { value: 0.0 },
        uMaxHeight: { value: 1.0 },
        uSeaLevel:  { value: 0.0 },
      },
      side: THREE.DoubleSide,
      wireframe: false,
    });
  }, []);

  // Обновляем униформы при изменении данных
  useEffect(() => {
    if (shaderMaterial) {
      shaderMaterial.uniforms.uMinHeight.value = minH;
      shaderMaterial.uniforms.uMaxHeight.value = maxH;
      shaderMaterial.uniforms.uSeaLevel.value = seaLevel;
      shaderMaterial.wireframe = wireframe;
      shaderMaterial.needsUpdate = true;
    }
  }, [minH, maxH, seaLevel, wireframe, shaderMaterial]);

  // Обновляем вершины геометрии
  useEffect(() => {
    if (!geometryRef.current || !heightData) return;

    const positions = geometryRef.current.attributes.position.array;
    for (let i = 0; i < heightData.length; i++) {
      positions[i * 3 + 2] = heightData[i] * zScale;
    }
    geometryRef.current.attributes.position.needsUpdate = true;
    geometryRef.current.computeVertexNormals();
  }, [heightData, zScale]);

  // Заглушка, если данные ещё не загружены
  if (!heightData) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200, 32, 32]} />
        <meshStandardMaterial color="#3b82f6" wireframe={wireframe} />
      </mesh>
    );
  }

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} material={shaderMaterial}>
      <planeGeometry
        ref={geometryRef}
        args={[200, 200, width - 1, height - 1]}
      />
    </mesh>
  );
};

export default Terrain;
