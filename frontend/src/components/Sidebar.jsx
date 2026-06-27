import React from 'react';

// ============================================================
// Вспомогательная функция: направление ветра → текстовая метка
// ============================================================
const azimuthToLabel = (deg) => {
  const dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  return dirs[Math.round(deg / 45) % 8];
};

// ============================================================
// Вспомогательная функция: м/с → шкала Бофорта (название)
// ============================================================
const beaufortName = (ms) => {
  if (ms < 0.3) return 'Штиль';
  if (ms < 1.6) return 'Тихий';
  if (ms < 3.4) return 'Лёгкий';
  if (ms < 5.5) return 'Слабый';
  if (ms < 8.0) return 'Умеренный';
  if (ms < 10.8) return 'Свежий';
  if (ms < 13.9) return 'Сильный';
  if (ms < 17.2) return 'Крепкий';
  if (ms < 20.8) return 'Очень крепкий';
  if (ms < 24.5) return 'Шторм';
  if (ms < 28.5) return 'Сильный шторм';
  return 'Ураган';
};

// ============================================================
// Компонент: Легенда высот рельефа
// ============================================================
const TerrainLegend = ({ terrainMeta }) => {
  if (!terrainMeta) return null;

  const { minMeters, maxMeters } = terrainMeta;
  const hasWater = minMeters < 0;
  const range = maxMeters - minMeters;

  // Вычисляем позицию отметки "0 м" на полоске (0%=низ, 100%=верх)
  const seaLevelPct = hasWater ? Math.round((0 - minMeters) / range * 100) : null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest border-b border-slate-700 pb-1">
        Легенда высот
      </h3>

      <div className="flex gap-3 items-stretch">
        {/* Градиентная полоска высот (снизу = низко, сверху = высоко) */}
        <div className="relative w-5 flex-shrink-0 rounded overflow-hidden" style={{ minHeight: '110px' }}>
          <div
            className="absolute inset-0 rounded"
            style={{
              background: 'linear-gradient(to top, #0f3d6b, #1e779f, #219a38, #7db542, #8c6a3d, #f5f5fa)',
            }}
          />
          {/* Отметка уровня моря */}
          {seaLevelPct !== null && (
            <div
              className="absolute w-full border-t-2 border-white/70"
              style={{ bottom: `${seaLevelPct}%` }}
            />
          )}
        </div>

        {/* Подписи */}
        <div className="flex flex-col justify-between text-xs text-slate-300 py-0.5">
          <span className="font-semibold text-white">▲ {maxMeters > 0 ? `+${Math.round(maxMeters)} м` : `${Math.round(maxMeters)} м`}</span>

          {/* Вставляем метки зон */}
          <span className="text-slate-400">Снег / скалы</span>
          <span className="text-slate-400">Склоны</span>
          <span className="text-slate-400">Низины</span>

          {hasWater ? (
            <span className="text-cyan-400 font-semibold">≈ 0 м (море)</span>
          ) : (
            <span className="text-slate-500">— (воды нет)</span>
          )}

          <span className="font-semibold text-blue-300">▼ {Math.round(minMeters)} м</span>
        </div>
      </div>

      {/* Цветовые блоки — палитра */}
      <div className="flex flex-col gap-1 text-xs mt-1">
        {hasWater && (
          <div className="flex items-center gap-2">
            <span className="w-4 h-3 rounded-sm flex-shrink-0" style={{ background: '#1e779f' }} />
            <span className="text-slate-400">Вода / мелководье</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="w-4 h-3 rounded-sm flex-shrink-0" style={{ background: '#219a38' }} />
          <span className="text-slate-400">Низины / луга</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-3 rounded-sm flex-shrink-0" style={{ background: '#8c6a3d' }} />
          <span className="text-slate-400">Горные склоны</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-3 rounded-sm flex-shrink-0" style={{ background: '#f5f5fa' }} />
          <span className="text-slate-400">Снежные пики</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Компонент: Карточка одной метеостанции
// ============================================================
const WindStationCard = ({ station }) => {
  const { name, lat, lon, azimuth_deg, speed_ms, color } = station;

  return (
    <div
      className="flex flex-col gap-1 p-2 rounded-lg border border-slate-700 bg-slate-900/60"
      style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
    >
      {/* Название + стрелка направления */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-slate-200 leading-tight">{name}</span>
        {/* Стрелка вращается по азимуту. 0° = стрелка вверх = ветер с севера (дует на юг) */}
        <span
          className="text-base leading-none flex-shrink-0"
          style={{ transform: `rotate(${azimuth_deg}deg)`, display: 'inline-block' }}
          title={`Азимут: ${Math.round(azimuth_deg)}°`}
        >
          ↑
        </span>
      </div>

      {/* Метрики */}
      <div className="flex justify-between items-center text-xs text-slate-400">
        <span>
          <span className="text-white font-bold">{speed_ms.toFixed(1)}</span> м/с
          &nbsp;·&nbsp;
          <span className="text-slate-300">{beaufortName(speed_ms)}</span>
        </span>
        <span className="text-slate-500">{azimuthToLabel(azimuth_deg)}</span>
      </div>

      {/* Координаты */}
      <div className="text-xs text-slate-600">
        {lat.toFixed(3)}°N, {lon.toFixed(3)}°E
      </div>
    </div>
  );
};

// ============================================================
// Компонент: Блок сводки погоды (ветер + туман + землетрясения)
// ============================================================
const WeatherSummary = ({ liveWindStations, dataSourceMode, isLiveLoading, liveError, weatherData }) => {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest border-b border-slate-700 pb-1">
        Актуальный ветер
      </h3>

      {isLiveLoading && (
        <div className="text-xs text-purple-400 animate-pulse">Загрузка данных Open-Meteo...</div>
      )}

      {liveError && !isLiveLoading && (
        <div className="text-xs text-red-400 bg-red-900/30 rounded p-2">
          Нет данных: {liveError}
        </div>
      )}

      {!isLiveLoading && !liveError && liveWindStations && (
        <div className="flex flex-col gap-1.5">
          {liveWindStations.map((station, idx) => (
            <WindStationCard key={idx} station={station} />
          ))}
          <p className="text-xs text-slate-600 mt-1">
            {dataSourceMode === 'custom' 
              ? 'Источник: Пользовательский JSON (Оффлайн симуляция)'
              : 'Источник: Open-Meteo API · IDW-интерполяция'
            }
          </p>
        </div>
      )}

      {/* Туман */}
      {weatherData?.fog && (
        <div className="flex items-center justify-between text-xs mt-1 p-2 rounded bg-slate-900/40 border border-slate-700">
          <span className="text-slate-400">Туман</span>
          <span className="text-white font-semibold">{Math.round(weatherData.fog.density ?? (weatherData.fog.density_percent / 100) ?? 0) * 100}%</span>
        </div>
      )}

      {/* Землетрясения */}
      {weatherData?.earthquakes?.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <span className="text-xs text-slate-500">
            Землетрясений на карте: {weatherData.earthquakes.length}
          </span>
          {weatherData.earthquakes.map((eq, idx) => (
            <div key={idx} className="text-xs text-slate-400 flex justify-between">
              <span>Маг. <span className="text-red-400 font-bold">{eq.magnitude}</span></span>
              <span>Глубина: {eq.depth_km} км</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Основной компонент Sidebar
// ============================================================
const Sidebar = ({
  onUpload, zScale, setZScale, wireframe, setWireframe,
  loading, layers, setLayers, tileImage, tileCoverage,
  terrainMeta, liveWindStations, dataSourceMode, isLiveLoading, liveError, weatherData,
}) => {

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && onUpload) {
      onUpload(file);
    }
  };

  return (
    <div
      className="w-80 bg-slate-800 flex flex-col shadow-2xl z-10 overflow-y-auto"
      style={{ maxHeight: '100vh' }}
    >
      {/* Шапка */}
      <div className="p-4 border-b border-slate-700 flex-shrink-0">
        <h1 className="text-lg font-bold text-blue-400">3D Метео ГИС</h1>
        <p className="text-xs text-slate-500">Система визуализации рельефа и погоды</p>
      </div>

      <div className="flex flex-col gap-4 p-4 overflow-y-auto">

        {/* Загрузка JSON */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-purple-400 uppercase tracking-widest">
            Метеоданные (JSON)
          </label>
          <input
            type="file"
            accept="application/json"
            onChange={handleFileChange}
            disabled={loading}
            className="block w-full text-xs text-slate-400
              file:mr-3 file:py-1.5 file:px-3
              file:rounded file:border-0
              file:text-xs file:font-semibold
              file:bg-purple-600 file:text-white
              hover:file:bg-purple-700 transition-colors cursor-pointer"
          />
          {loading && <span className="text-xs text-purple-400 animate-pulse">Обработка на сервере...</span>}
        </div>

        {/* Масштаб высоты */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-300 flex justify-between">
            <span>Масштаб высоты (Z-Scale)</span>
            <span className="text-blue-400 font-bold">{zScale}×</span>
          </label>
          <input
            type="range" min="1" max="100" value={zScale}
            onChange={(e) => setZScale(parseFloat(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer"
          />
        </div>

        {/* Режим сетки */}
        <div className="flex gap-2 items-center">
          <input
            type="checkbox" id="wireframe" checked={wireframe}
            onChange={(e) => setWireframe(e.target.checked)}
            className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
          />
          <label htmlFor="wireframe" className="text-xs text-slate-300 cursor-pointer">
            Режим сетки (Wireframe)
          </label>
        </div>

        {/* Тематические слои */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest border-b border-slate-700 pb-1">
            Тематические слои
          </h3>
          {[
            { key: 'terrain', label: '3D Рельеф', color: 'accent-blue-500' },
            { key: 'fog', label: 'Туман (Fog)', color: 'accent-purple-500' },
            { key: 'wind', label: 'Потоки ветра', color: 'accent-green-500' },
            { key: 'earthquakes', label: 'Землетрясения', color: 'accent-red-500' },
          ].map(({ key, label, color }) => (
            <label key={key} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })}
                className={`w-4 h-4 ${color}`}
              />
              {label}
            </label>
          ))}
        </div>

        {/* Легенда высот рельефа */}
        <TerrainLegend terrainMeta={terrainMeta} />

        {/* Сводка погоды (ветер + туман + землетрясения) */}
        <div>
          <WeatherSummary
            liveWindStations={liveWindStations}
            dataSourceMode={dataSourceMode}
            isLiveLoading={isLiveLoading}
            liveError={liveError}
            weatherData={weatherData}
          />
        </div>

        {/* Превью тайла из AWS */}
        {tileImage && (
          <div className="flex flex-col gap-2 opacity-80 hover:opacity-100 transition-opacity">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-1">
              Тайл AWS (Raw)
            </label>
            <img
              src={`data:image/png;base64,${tileImage}`}
              alt="Terrain Tile"
              className="w-full h-auto rounded border border-slate-700 shadow-md"
            />
            {tileCoverage && (
              <p className="text-xs text-blue-400">
                Охват: ~{tileCoverage} × {tileCoverage} км
              </p>
            )}
          </div>
        )}
      </div>

      {/* Футер */}
      <div className="mt-auto p-3 border-t border-slate-700 flex-shrink-0">
        <p className="text-xs text-slate-600 text-center">
          Источник высот: AWS Terrain-RGB · Ветер: Open-Meteo
        </p>
      </div>
    </div>
  );
};

export default Sidebar;
