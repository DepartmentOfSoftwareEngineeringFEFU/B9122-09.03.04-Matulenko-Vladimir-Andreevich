import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { createNoise3D } from 'simplex-noise';

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

const TERRAIN_SIZE = 200;       // Размер плоскости Three.js (совпадает с Terrain.jsx)
const PARTICLE_COUNT = 6000;    // Количество линий-шлейфов ветра
const HALF_SIZE = TERRAIN_SIZE / 2;

// Высота полёта частиц над рельефом (в единицах Three.js)
const FLY_ALTITUDE = 1.5;

// Множитель визуальной скорости.
// На карте 14×14 км реальные 10 м/с абсолютно незаметны, поэтому ускоряем
// движение частиц в визуальном пространстве.
// Подобран эмпирически: при speed_ms=15 частицы плавно дрейфуют над рельефом.
const VISUAL_SPEED_MULTIPLIER = 3;

// Сила влияния градиента рельефа на вектор ветра.
// Чем выше значение — тем сильнее ветер огибает горы и канализируется в ущельях.
const GRADIENT_INFLUENCE = 8.0;

// Амплитуда турбулентности (случайные завихрения от simplex-шума).
const TURBULENCE_AMPLITUDE = 4.0;

// Шаг сэмплирования для вычисления градиента.
// Это расстояние в координатах Three.js, на котором мы берём разницу высот.
const GRADIENT_STEP = 2.0;

// Длина шлейфа (хвоста) линии.
// Хвост вычисляется как: tailPos = headPos - velocity * STREAK_LENGTH.
// Чем больше значение, тем длиннее визуальный "след" ветра.
const STREAK_LENGTH = 0.5;

// Максимальный возраст частицы (в кадрах, ~60 FPS).
// После достижения MAX_AGE частица "умирает" и респавнится в случайной точке.
// Это предотвращает Sink Accumulation — скопление всех частиц в низинах,
// куда их затягивает градиент рельефа.
const MAX_AGE = 150;

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (вынесены за пределы компонента для производительности)
// ============================================================================

/**
 * getTerrainHeight — Проекция мировых координат (X, Z) на матрицу высот.
 *
 * ПРИНЦИП РАБОТЫ:
 * Плоскость Three.js (200×200) простирается от -100 до +100 по обеим осям.
 * Матрица высот — одномерный массив из terrainSize×terrainSize элементов (обычно 256×256).
 * Каждый элемент содержит нормализованную высоту от 0.0 до 1.0.
 *
 * Чтобы получить высоту в мировых координатах Three.js, нужно:
 * 1. Перевести координаты (x, z) из диапазона [-100, +100] в [0, 1] — это «процент» по каждой оси.
 * 2. Умножить процент на (terrainSize - 1), получив дробный индекс в матрице.
 * 3. Взять целую часть (floor) как индекс строки/колонки.
 * 4. Извлечь нормализованное значение из одномерного массива: matrix[row * width + col].
 * 5. Умножить на zScale — получаем итоговую Y-координату в пространстве сцены.
 *
 * @param {number} x — Мировая координата X частицы (от -HALF_SIZE до +HALF_SIZE)
 * @param {number} z — Мировая координата Z частицы (от -HALF_SIZE до +HALF_SIZE)
 * @param {Float32Array|Array} terrainMatrix — Одномерный массив нормализованных высот
 * @param {number} matrixSize — Размер стороны матрицы (например, 256)
 * @param {number} zScale — Коэффициент вертикального масштаба (из ползунка UI)
 * @returns {number|null} — Y-координата поверхности рельефа или null, если данных нет
 */
function getTerrainHeight(x, z, terrainMatrix, matrixSize, zScale) {
  if (!terrainMatrix || !matrixSize) return null;

  // Шаг 1: Переводим мировые координаты [-HALF_SIZE, +HALF_SIZE] → [0, 1]
  const percentX = (x + HALF_SIZE) / TERRAIN_SIZE;
  const percentZ = (z + HALF_SIZE) / TERRAIN_SIZE;

  // Шаг 2: Переводим [0, 1] → дробный индекс [0, matrixSize-1]
  const floatCol = percentX * (matrixSize - 1);
  const floatRow = percentZ * (matrixSize - 1);

  // Шаг 3: Берём целочисленные индексы и зажимаем (clamp) в допустимый диапазон
  const col = Math.max(0, Math.min(matrixSize - 1, Math.floor(floatCol)));
  const row = Math.max(0, Math.min(matrixSize - 1, Math.floor(floatRow)));

  // Шаг 4: Вычисляем позицию в одномерном массиве (row-major order)
  const idx = row * matrixSize + col;

  // Шаг 5: Извлекаем нормализованную высоту и умножаем на zScale
  return terrainMatrix[idx] * zScale;
}

/**
 * getTerrainGradient — Вычисление вектора градиента (уклона) рельефа.
 *
 * Градиент вычисляется через центральные конечные разности:
 *   gradientX = (height(x + step, z) - height(x - step, z)) / (2 * step)
 *   gradientZ = (height(x, z + step) - height(x, z - step)) / (2 * step)
 *
 * Результат ИНВЕРТИРУЕТСЯ: ветер «скатывается» с горы,
 * двигаясь в направлении, противоположном подъёму.
 *
 * @returns {{ gx: number, gz: number }} — Компоненты вектора уклона (инвертированные)
 */
function getTerrainGradient(x, z, terrainMatrix, matrixSize, zScale) {
  if (!terrainMatrix) return { gx: 0, gz: 0 };

  const step = GRADIENT_STEP;

  const hRight = getTerrainHeight(x + step, z, terrainMatrix, matrixSize, zScale) ?? 0;
  const hLeft  = getTerrainHeight(x - step, z, terrainMatrix, matrixSize, zScale) ?? 0;
  const hFront = getTerrainHeight(x, z + step, terrainMatrix, matrixSize, zScale) ?? 0;
  const hBack  = getTerrainHeight(x, z - step, terrainMatrix, matrixSize, zScale) ?? 0;

  const gradX = (hRight - hLeft) / (2 * step);
  const gradZ = (hFront - hBack) / (2 * step);

  // ИНВЕРСИЯ: ветер «отталкивается» от склона
  return { gx: -gradX, gz: -gradZ };
}


// ============================================================================
// КОМПОНЕНТ WindSystem
// ============================================================================

/**
 * <WindSystem /> — Физически-достоверная система шлейфов ветра.
 *
 * АРХИТЕКТУРА ШЛЕЙФОВ (LineSegments вместо Points):
 * Каждая «частица» ветра — это отрезок из двух точек: Голова и Хвост.
 * Голова движется по стандартной формуле Velocity, а Хвост вычисляется как
 * headPos - velocity * STREAK_LENGTH. Это создаёт вытянутые линии,
 * ориентированные строго по направлению движения — как настоящие потоки ветра.
 *
 * ЖИЗНЕННЫЙ ЦИКЛ (Anti-Sink):
 * Каждая частица имеет «возраст» (ages[i]). Когда возраст достигает MAX_AGE,
 * частица респавнится в случайной точке карты. Это предотвращает скопление
 * всех частиц в низинах и ущельях, куда их затягивает градиент рельефа.
 */
const WindSystem = ({ windData, terrainMatrix, terrainSize, zScale, visible }) => {
  const linesRef = useRef();

  // Однократно создаём генератор 3D-шума Simplex.
  const noise3D = useMemo(() => createNoise3D(), []);

  // Инициализация буферов.
  // positions: Float32Array на 2 точки (Голова + Хвост) × 3 компоненты (x, y, z) × PARTICLE_COUNT.
  //   Итого: PARTICLE_COUNT * 6 элементов.
  // ages: Float32Array на PARTICLE_COUNT элементов — возраст каждой частицы.
  //   Инициализируем случайно от 0 до MAX_AGE, чтобы респавн был рассредоточен по времени
  //   (иначе все частицы умрут и возродятся одновременно — будет заметный «мигающий» артефакт).
  const { positions, ages } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 2 * 3); // 6 floats на частицу
    const ag = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i6 = i * 6;
      // Голова: случайная позиция
      const hx = (Math.random() - 0.5) * TERRAIN_SIZE;
      const hz = (Math.random() - 0.5) * TERRAIN_SIZE;
      pos[i6]     = hx;  // head X
      pos[i6 + 1] = 0;   // head Y (будет пересчитано в первом кадре)
      pos[i6 + 2] = hz;  // head Z

      // Хвост: изначально совпадает с головой (нулевая длина шлейфа)
      pos[i6 + 3] = hx;  // tail X
      pos[i6 + 4] = 0;   // tail Y
      pos[i6 + 5] = hz;  // tail Z

      // Случайный начальный возраст, чтобы респавн был растянут во времени
      ag[i] = Math.random() * MAX_AGE;
    }

    return { positions: pos, ages: ag };
  }, []);

  // ========================================================================
  // ГЛАВНЫЙ ЦИКЛ АНИМАЦИИ (вызывается ~60 раз в секунду)
  // ========================================================================
  useFrame((state, delta) => {
    if (!linesRef.current || !windData || !terrainMatrix) return;

    const posArray = linesRef.current.geometry.attributes.position.array;
    const time = state.clock.getElapsedTime();

    // --- Предвычисление BaseWind (одно на все частицы) ---
    const azimuthRad = (windData.azimuth_deg * Math.PI) / 180;
    const baseWindX = Math.sin(azimuthRad) * windData.speed_ms * VISUAL_SPEED_MULTIPLIER;
    const baseWindZ = Math.cos(azimuthRad) * windData.speed_ms * VISUAL_SPEED_MULTIPLIER;

    // --- Обход всех частиц ---
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i6 = i * 6;

      // =================================================================
      // ЖИЗНЕННЫЙ ЦИКЛ: Инкремент возраста и проверка на респавн
      // =================================================================
      ages[i] += 1;

      if (ages[i] >= MAX_AGE) {
        // Частица «умерла» — респавним в случайной точке карты.
        // Это ключевой механизм Anti-Sink: без него градиент рельефа
        // постепенно стянул бы ВСЕ частицы в самые низкие точки карты.
        ages[i] = 0;

        const newX = (Math.random() - 0.5) * TERRAIN_SIZE;
        const newZ = (Math.random() - 0.5) * TERRAIN_SIZE;
        const newY = (getTerrainHeight(newX, newZ, terrainMatrix, terrainSize, zScale) ?? 0) + FLY_ALTITUDE;

        // Голова = Хвост (шлейф нулевой длины в момент рождения,
        // чтобы линия не тянулась через всю карту от старой позиции)
        posArray[i6]     = newX;
        posArray[i6 + 1] = newY;
        posArray[i6 + 2] = newZ;
        posArray[i6 + 3] = newX;
        posArray[i6 + 4] = newY;
        posArray[i6 + 5] = newZ;

        continue; // Пропускаем вычисление Velocity в кадре рождения
      }

      // =================================================================
      // Текущие координаты Головы
      // =================================================================
      let px = posArray[i6];
      let pz = posArray[i6 + 2];

      // =================================================================
      // КОМПОНЕНТ 1: BaseWind (базовое направление ветра)
      // =================================================================
      let vx = baseWindX;
      let vz = baseWindZ;

      // =================================================================
      // КОМПОНЕНТ 2: Terrain Gradient (обтекание рельефа)
      // =================================================================
      const gradient = getTerrainGradient(px, pz, terrainMatrix, terrainSize, zScale);
      vx += gradient.gx * GRADIENT_INFLUENCE;
      vz += gradient.gz * GRADIENT_INFLUENCE;

      // =================================================================
      // КОМПОНЕНТ 3: Simplex Noise (процедурная турбулентность)
      // =================================================================
      const noiseX = noise3D(px * 0.02, pz * 0.02, time * 0.3);
      const noiseZ = noise3D(px * 0.02 + 100.0, pz * 0.02 + 100.0, time * 0.3);
      vx += noiseX * TURBULENCE_AMPLITUDE;
      vz += noiseZ * TURBULENCE_AMPLITUDE;

      // =================================================================
      // ИТОГОВОЕ СМЕЩЕНИЕ ГОЛОВЫ: Velocity × delta
      // =================================================================
      px += vx * delta;
      pz += vz * delta;

      // =================================================================
      // ЗАЦИКЛИВАНИЕ (Wrapping)
      // =================================================================
      if (px > HALF_SIZE)  px -= TERRAIN_SIZE;
      if (px < -HALF_SIZE) px += TERRAIN_SIZE;
      if (pz > HALF_SIZE)  pz -= TERRAIN_SIZE;
      if (pz < -HALF_SIZE) pz += TERRAIN_SIZE;

      // =================================================================
      // ПРИВЯЗКА ГОЛОВЫ К РЕЛЬЕФУ
      // =================================================================
      const headY = (getTerrainHeight(px, pz, terrainMatrix, terrainSize, zScale) ?? 0) + FLY_ALTITUDE;

      // Записываем координаты Головы
      posArray[i6]     = px;
      posArray[i6 + 1] = headY;
      posArray[i6 + 2] = pz;

      // =================================================================
      // ВЫЧИСЛЕНИЕ ХВОСТА (Tail = Head - Velocity * STREAK_LENGTH)
      //
      // Хвост — это точка, из которой частица «пришла». Вычитая вектор
      // скорости, умноженный на STREAK_LENGTH, мы получаем позицию
      // «в прошлом», что визуально создаёт вытянутый след ветра.
      //
      // ВАЖНО: Y-координата Хвоста ТАКЖЕ привязывается к рельефу
      // (через getTerrainHeight), чтобы хвост линии не «протыкал» гору,
      // когда частица движется вдоль склона.
      // =================================================================
      const tailX = px - vx * delta * STREAK_LENGTH;
      const tailZ = pz - vz * delta * STREAK_LENGTH;
      const tailY = (getTerrainHeight(tailX, tailZ, terrainMatrix, terrainSize, zScale) ?? 0) + FLY_ALTITUDE;

      posArray[i6 + 3] = tailX;
      posArray[i6 + 4] = tailY;
      posArray[i6 + 5] = tailZ;
    }

    // Сообщаем Three.js, что данные в GPU-буфере изменились
    linesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  // Если слой выключен или нет данных ветра, ничего не рендерим
  if (!visible || !windData) return null;

  return (
    <lineSegments ref={linesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={PARTICLE_COUNT * 2}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      {/*
        lineBasicMaterial: простейший материал для линий.
        depthWrite={false} — линии не перекрывают друг друга в z-буфере,
        что предотвращает артефакты полупрозрачности.
        fog={true} — линии реагируют на туман сцены.
      */}
      <lineBasicMaterial
        color={0xb0e0ff}
        transparent
        opacity={0.7}
        depthWrite={false}
        fog={true}
      />
    </lineSegments>
  );
};

export default WindSystem;
