import React, { useRef, useEffect } from 'react';

const Terrain = ({ heightData, resolution, zScale, wireframe }) => {
  const meshRef = useRef();
  const geometryRef = useRef();

  const [width, height] = resolution;

  // Хуки (в том числе useEffect) всегда должны вызываться до любых условных return!
  // Обновляем геометрию (вершины сетки) при изменении данных высоты или масштаба Z
  useEffect(() => {
    if (!geometryRef.current || !heightData) return;

    // В Three.js positions - это одномерный Float32Array: [x1, y1, z1, x2, y2, z2, ...]
    // Так как изначальная PlaneGeometry лежит в осях X, Y, мы меняем координату Z.
    const positions = geometryRef.current.attributes.position.array;

    // Итерируемся по массиву высот, полученному с бэкенда (0.0 - 1.0).
    for (let i = 0; i < heightData.length; i++) {
        // Умножаем на 3, чтобы получить индекс для Z (X=0, Y=1, Z=2)
        // Нормализованное значение умножаем на zScale для визуализации реальной высоты
        positions[i * 3 + 2] = heightData[i] * zScale; 
    }

    // Сообщаем Three.js, что массив вершин обновился и данные нужно закинуть в GPU
    geometryRef.current.attributes.position.needsUpdate = true;
    
    // КРИТИЧЕСКИ ВАЖНО: Пересчитываем нормали вершин.
    // Без этого освещение не поймет, что поверхность стала рельефной, и тени/свет будут некорректными.
    geometryRef.current.computeVertexNormals();

  }, [heightData, zScale]);

  // Если данные еще не загружены, показываем базовую плоскую поверхность
  if (!heightData) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200, 32, 32]} />
        <meshStandardMaterial color="#3b82f6" wireframe={wireframe} />
      </mesh>
    );
  }

  return (
    // Поворачиваем плоскость на 90 градусов (по оси X), чтобы она стала "полом", а не "стеной"
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      {/* 
        args: [ширина_на_сцене, высота_на_сцене, кол_во_сегментов_по_ширине, кол_во_сегментов_по_высоте] 
        Мы задаем сегменты на 1 меньше разрешения, чтобы количество вершин совпало с разрешением (например, 256x256 вершин).
      */}
      <planeGeometry 
        ref={geometryRef} 
        args={[200, 200, width - 1, height - 1]} 
      />
      
      {/* Материал: meshStandardMaterial реагирует на свет (ambient и directional). */}
      <meshStandardMaterial 
        color="#22c55e"    // базовый цвет "зеленый"
        wireframe={wireframe} // режим сетки
        roughness={0.8}    // шероховатость поверхности
        metalness={0.1}    // металличность (низкая, так как это земля)
        side={2}           // THREE.DoubleSide, чтобы видеть рельеф и снизу
      />
    </mesh>
  );
};

export default Terrain;
