import React from 'react';

const ReportModal = ({ reportData, onClose }) => {
  if (!reportData) return null;

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

        <div className="flex flex-col gap-3 text-sm text-slate-300">
          <p><span className="font-semibold text-white">Файл:</span> {reportData.filename}</p>
          <p><span className="font-semibold text-white">Дата загрузки:</span> {new Date(reportData.upload_time).toLocaleString('ru-RU')}</p>
          <p><span className="font-semibold text-white">Общее кол-во объектов:</span> {reportData.total_records}</p>
          
          <div className="my-2 p-3 bg-slate-900 rounded-lg">
            <h3 className="font-semibold text-purple-400 mb-1">Распознанные явления:</h3>
            <ul className="list-disc list-inside">
              <li>Землетрясений: {reportData.earthquakes_count}</li>
              <li>Слоёв тумана: {reportData.fog_count}</li>
              <li>Измерений ветра: {reportData.wind_count}</li>
            </ul>
          </div>

          <div className="my-2 p-3 bg-slate-900 rounded-lg">
            <h3 className="font-semibold text-green-400 mb-1">Пространственный охват:</h3>
            {reportData.min_lat !== null ? (
              <ul className="list-disc list-inside text-xs">
                <li>Широта (Lat): {reportData.min_lat?.toFixed(2)}° до {reportData.max_lat?.toFixed(2)}°</li>
                <li>Долгота (Lon): {reportData.min_lon?.toFixed(2)}° до {reportData.max_lon?.toFixed(2)}°</li>
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
      </div>
    </div>
  );
};

export default ReportModal;
