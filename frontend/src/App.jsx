import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Sidebar from './components/Sidebar';
import Terrain from './components/Terrain';
import WeatherEffects from './components/WeatherEffects';
import ReportModal from './components/ReportModal';

function App() {
  const [heightData, setHeightData] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [currentFileId, setCurrentFileId] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [resolution, setResolution] = useState([256, 256]);
  const [zScale, setZScale] = useState(10);
  const [wireframe, setWireframe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tileImage, setTileImage] = useState(null);
  const [tileCoverage, setTileCoverage] = useState(null);

  // Стейт менеджера слоев
  const [layers, setLayers] = useState({
    terrain: true,
    fog: true,
    wind: true,
    earthquakes: true
  });

  // Единая логика для отправки метеоданных и получения автоматической загрузки рельефа
  const handleSimulationUpload = async (file) => {
    setLoading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Отправляем JSON-файл погоды на единую точку входа
      const response = await fetch("http://localhost:8000/api/v1/simulation/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(JSON.stringify(errorData.detail) || 'Ошибка при загрузке данных симуляции');
      }

      // Структура ответа: { terrain: { matrix, size, ... }, weather: { ... } }
      const data = await response.json();
      
      // Обновляем геометрию
      setHeightData(data.terrain.matrix);
      setResolution([data.terrain.size, data.terrain.size]);
      setTileImage(data.terrain.image_base64);
      setTileCoverage(data.terrain.tile_width_km);
      
      // Обновляем погоду
      setWeatherData(data.weather);
      
      // В MVP мы временно не прокидываем file_id с нового эндпоинта (или можно сделать это позже)
      // setShowReportModal(true);
      
    } catch (err) {
      console.error(err);
      setError(`Ошибка симуляции: ${err.message}`);
      alert(`Ошибка: ${err.message}`); // Показываем простое уведомление
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="flex h-screen w-full bg-slate-900 text-white overflow-hidden">
      {/* Боковая панель для управления параметрами (UI) */}
      <Sidebar 
        onUpload={handleSimulationUpload}
        zScale={zScale} 
        setZScale={setZScale}
        wireframe={wireframe}
        setWireframe={setWireframe}
        loading={loading}
        layers={layers}
        setLayers={setLayers}
        tileImage={tileImage}
        tileCoverage={tileCoverage}
      />

      {/* Основной контейнер для 3D сцены */}
      <div className="flex-1 relative">
        <Canvas camera={{ position: [0, 150, 200], fov: 60 }}>
          {/* Базовое освещение для отрисовки реалистичных теней и формы рельефа */}
          <ambientLight intensity={0.4} />
          <directionalLight position={[100, 100, 50]} intensity={1.5} />
          <directionalLight position={[-100, 50, -50]} intensity={0.5} />
          
          {/* Контроллер для вращения камерой (OrbitControls) */}
          <OrbitControls makeDefault />

          {/* Сам 3D Рельеф */}
          {layers.terrain && (
            <Terrain 
              heightData={heightData} 
              resolution={resolution} 
              zScale={zScale} 
              wireframe={wireframe}
            />
          )}
          
          {/* Интеграция 3D явлений погоды */}
          <WeatherEffects 
            weatherData={weatherData} 
            layers={layers} 
            heightData={heightData}
            resolution={resolution}
            zScale={zScale}
          />
        </Canvas>

        {/* Уведомление об ошибке прямо на экране (Alert) */}
        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500/90 text-white px-6 py-3 rounded shadow-lg z-50 transition-all font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* Модальное окно отчета */}
        {showReportModal && (
          <ReportModal 
            fileId={currentFileId} 
            onClose={() => setShowReportModal(false)} 
          />
        )}
      </div>
    </div>
  );
}

export default App;
