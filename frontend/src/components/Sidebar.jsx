import React from 'react';
const Sidebar = ({ onUpload, zScale, setZScale, wireframe, setWireframe, loading, layers, setLayers, tileImage, tileCoverage }) => {
  
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && onUpload) {
      onUpload(file);
    }
  };

  return (
    <div className="w-80 bg-slate-800 p-6 flex flex-col gap-6 shadow-2xl z-10">
      <h1 className="text-2xl font-bold text-blue-400 border-b border-slate-700 pb-2">3D Terrain MVP</h1>
      


      {/* Секция загрузки JSON данных о погоде */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-slate-300 transform animate-pulse text-purple-400">Метеоданные (JSON)</label>
        <input 
          type="file" 
          accept="application/json" 
          onChange={handleFileChange}
          disabled={loading}
          className="block w-full text-sm text-slate-400
            file:mr-4 file:py-2 file:px-4
            file:rounded file:border-0
            file:text-sm file:font-semibold
            file:bg-purple-600 file:text-white
            hover:file:bg-purple-700 transition-colors
            cursor-pointer"
        />
        {loading && <span className="text-sm text-purple-400 animate-pulse">Обработка на сервере...</span>}
      </div>

      {/* Настройка масштаба */}
      <div className="flex flex-col gap-2 mt-4">
        <label className="text-sm font-semibold text-slate-300 flex justify-between">
          <span>Масштаб высоты (Z-Scale)</span>
          <span className="text-blue-400">{zScale}</span>
        </label>
        <input 
          type="range" 
          min="1" 
          max="100" 
          value={zScale} 
          onChange={(e) => setZScale(parseFloat(e.target.value))}
          className="w-full accent-blue-500 cursor-pointer"
        />
      </div>

      {/* Режим отображения */}
      <div className="flex gap-3 items-center mt-2">
        <input 
          type="checkbox" 
          id="wireframe" 
          checked={wireframe}
          onChange={(e) => setWireframe(e.target.checked)}
          className="w-5 h-5 accent-blue-500 rounded cursor-pointer"
        />
        <label htmlFor="wireframe" className="text-sm font-semibold text-slate-300 cursor-pointer">
          Режим сетки (Wireframe)
        </label>
      </div>

      {/* Менеджер слоев */}
      <div className="flex flex-col gap-3 mt-4">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest border-b border-slate-700 pb-1">Тематические слои</h3>
        
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input 
            type="checkbox" 
            checked={layers.terrain} 
            onChange={(e) => setLayers({...layers, terrain: e.target.checked})}
            className="w-4 h-4 accent-blue-500"
          /> 3D Рельеф
        </label>
        
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input 
            type="checkbox" 
            checked={layers.fog} 
            onChange={(e) => setLayers({...layers, fog: e.target.checked})}
            className="w-4 h-4 accent-purple-500"
          /> Туман (Fog)
        </label>
        
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input 
            type="checkbox" 
            checked={layers.wind} 
            onChange={(e) => setLayers({...layers, wind: e.target.checked})}
            className="w-4 h-4 accent-green-500"
          /> Потоки ветра
        </label>
        
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input 
            type="checkbox" 
            checked={layers.earthquakes} 
            onChange={(e) => setLayers({...layers, earthquakes: e.target.checked})}
            className="w-4 h-4 accent-red-500"
          /> Землетрясения
        </label>
      </div>

      {/* Превью тайла из AWS */}
      {tileImage && (
        <div className="flex flex-col gap-2 mt-4 opacity-80 hover:opacity-100 transition-opacity">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-1">Тайл AWS (Raw)</label>
          <img 
            src={`data:image/png;base64,${tileImage}`} 
            alt="Terrain Tile" 
            className="w-full h-auto rounded border-2 border-slate-700 shadow-md"
          />
          {tileCoverage && (
            <p className="text-xs text-blue-400 mt-1">
              Охват: ~{tileCoverage} x {tileCoverage} км
            </p>
          )}
        </div>
      )}

      <div className="mt-auto text-xs text-slate-500 bg-slate-900/50 p-4 rounded-md">
        <p className="font-semibold text-slate-400 mb-1">MVP Этап 3</p>
        <p>Используйте слои для отображения гео-спроецированных данных Метео+Рельеф.</p>
      </div>
    </div>
  );
};

export default Sidebar;
