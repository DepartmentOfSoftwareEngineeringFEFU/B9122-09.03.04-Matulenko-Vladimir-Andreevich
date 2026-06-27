/**
 * Интерполирует реальные географические координаты (широта и долгота) 
 * в локальные 3D-координаты сцены (X и Z).
 * 
 * Математическая модель:
 * Сцена Three.js имеет начало координат в центре (0, 0, 0). 
 * Плоскость рельефа имеет размер terrainSize x terrainSize.
 * Следовательно, координаты X и Z на плоскости меняются от -terrainSize/2 до +terrainSize/2.
 * 
 * Функция берет процентное соотношение lat/lon относительно заданного ограничивающего 
 * прямоугольника (bounding box) и проецирует его на локальную сетку.
 * 
 * @param {number} lat - Широта текущего объекта
 * @param {number} lon - Долгота текущего объекта
 * @param {number} minLat - Минимальная широта карты рельефа
 * @param {number} maxLat - Максимальная широта карты рельефа
 * @param {number} minLon - Минимальная долгота карты рельефа
 * @param {number} maxLon - Максимальная долгота карты рельефа
 * @param {number} terrainSize - Физический размер 3D плоскости (например, 200)
 * @returns {object} { x, z } - Локальные координаты Three.js
 */
export function mapGeoToLocal(lat, lon, minLat, maxLat, minLon, maxLon, terrainSize) {
    // 1. Вычисляем долю (от 0.0 до 1.0) нахождения точки внутри прямоугольника.
    // Если lon = minLon, то dx = 0. Если lon = maxLon, то dx = 1.
    let dx = (lon - minLon) / (maxLon - minLon);
    
    // Для широты (Y/Z ось). Широта растет снизу вверх, как и ось Z в 3D (с отрицательной стороны в положительную в зависимости от камеры,
    // но в Three.js Z уходит "вглубь экрана" как отрицательный, поэтому инвертируем или мапим напрямую).
    // Стандартно: minLat (юг) -> внизу, maxLat (север) -> вверху.
    let dz = (lat - minLat) / (maxLat - minLat);

    // Защита от выхода за границы 3D модели (если данные погоды за пределами карты)
    dx = Math.max(0, Math.min(1, dx));
    dz = Math.max(0, Math.min(1, dz));

    // 2. Переводим долю в 3D координаты.
    // Сцена от -terrainSize/2 до +terrainSize/2
    const halfSize = terrainSize / 2;
    
    // Внимание: в плоскости X идет слева направо (соответствует долготе lon).
    const localX = (dx * terrainSize) - halfSize;
    
    // Знак будет зависеть от того, что Север в Three.js - это обычно -Z.
    // Поэтому если lat=maxLat (dz=1, Север), нам нужно получить -halfSize.
    // Если lat=minLat (dz=0, Юг), нужно получить +halfSize.
    const localZ = halfSize - (dz * terrainSize);

    return { x: localX, z: localZ };
}
