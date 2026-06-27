/**
 * Интерполирует реальные географические координаты (широта и долгота) 
 * в локальные 3D-координаты сцены (X и Z).
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
    let dx = (lon - minLon) / (maxLon - minLon);
    let dz = (lat - minLat) / (maxLat - minLat);

    dx = Math.max(0, Math.min(1, dx));
    dz = Math.max(0, Math.min(1, dz));

    const halfSize = terrainSize / 2;
    const localX = (dx * terrainSize) - halfSize;
    const localZ = halfSize - (dz * terrainSize);

    return { x: localX, z: localZ };
}

/**
 * Конвертирует локальные координаты сцены (x, z) обратно в географические (lat, lon)
 */
export function mapLocalToGeo(x, z, minLat, maxLat, minLon, maxLon, terrainSize) {
  const lonPercent = (x / terrainSize) + 0.5;
  const latPercent = -(z / terrainSize) + 0.5;

  const lon = lonPercent * (maxLon - minLon) + minLon;
  const lat = latPercent * (maxLat - minLat) + minLat;

  return { lat, lon };
}
