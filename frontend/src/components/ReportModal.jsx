import React, { useEffect, useState } from 'react';

const ReportModal = ({ fileId, onClose }) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fileId) return;
    
    // Получаем отчет по ID загруженного файла с бэкенда (MET_004)
    const fetchReport = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/v1/weather/report/${fileId}`);
        if (!res.ok) throw new Error('Не удалось загрузить отчет');
        const data = await res.json();
        setReport(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchReport();
  }, [fileId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          ✕
        </button>
        
        <h2 className="text-xl font-bold text-blue-400 mb-4 border-b border-slate-700 pb-2">
          Сводный отчет по данным
        </h2>

        {loading ? (
          <p className="text-slate-300 animate-pulse">Генерация отчета...</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : report ? (
          <div className="flex flex-col gap-3 text-sm text-slate-300">
            <p><span className="font-semibold text-white">Файл:</span> {report.filename}</p>
            <p><span className="font-semibold text-white">Дата загрузки:</span> {new Date(report.upload_time).toLocaleString('ru-RU')}</p>
            <p><span className="font-semibold text-white">Общее кол-во объектов:</span> {report.total_records}</p>
            
            <div className="my-2 p-3 bg-slate-900 rounded-lg">
              <h3 className="font-semibold text-purple-400 mb-1">Распознанные явления:</h3>
              <ul className="list-disc list-inside">
                <li>Землетрясений: {report.earthquakes_count}</li>
                <li>Слоёв тумана: {report.fog_count}</li>
                <li>Измерений ветра: {report.wind_count}</li>
              </ul>
            </div>

            <div className="my-2 p-3 bg-slate-900 rounded-lg">
              <h3 className="font-semibold text-green-400 mb-1">Пространственный охват:</h3>
              {report.min_lat !== null ? (
                <ul className="list-disc list-inside text-xs">
                  <li>Широта (Lat): {report.min_lat?.toFixed(2)}° до {report.max_lat?.toFixed(2)}°</li>
                  <li>Долгота (Lon): {report.min_lon?.toFixed(2)}° до {report.max_lon?.toFixed(2)}°</li>
                </ul>
              ) : (
                <p className="text-xs text-slate-500">Нет географических данных</p>
              )}
            </div>
            
            <button 
              onClick={onClose}
              className="mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded w-full transition-colors"
            >
              Перейти к визуализации
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ReportModal;
