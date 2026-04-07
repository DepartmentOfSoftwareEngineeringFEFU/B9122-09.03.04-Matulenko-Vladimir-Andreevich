# 🗺️ Трёхмерные карты с визуализацией природных явлений

Дипломный проект — клиент-серверное веб-приложение для генерации интерактивного 3D-рельефа из карт высот и наложения метеорологических данных (землетрясения, туман, ветер) с гео-проекцией координат.

## Технологический стек

| Компонент | Технологии |
|-----------|-----------|
| **Backend** | Python, FastAPI, SQLAlchemy, OpenCV, NumPy |
| **Frontend** | React, Three.js (@react-three/fiber), Tailwind CSS |
| **База данных** | SQLite (MVP) / PostgreSQL (production) |
| **Сборщик** | Vite |

## Структура проекта

```
Diplom/
├── backend/
│   ├── main.py            # API-эндпоинты FastAPI
│   ├── database.py        # Подключение к БД (SQLAlchemy async)
│   ├── models.py          # Модели таблиц (weather_logs, terrain_maps)
│   ├── schemas.py         # Pydantic-схемы валидации
│   └── requirements.txt   # Python-зависимости
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Главный компонент приложения
│   │   ├── components/
│   │   │   ├── Terrain.jsx      # 3D-рельеф (PlaneGeometry + heightmap)
│   │   │   ├── WeatherEffects.jsx # Визуализация погоды (ветер, туман, землетрясения)
│   │   │   ├── Sidebar.jsx      # Панель управления и менеджер слоёв
│   │   │   └── ReportModal.jsx  # Модальное окно отчёта
│   │   └── utils/
│   │       └── geo.js           # Математика гео-проекции (Lat/Lon → X/Z)
│   ├── index.html
│   └── package.json
├── tests/
│   └── weather_test.json  # Тестовые метеоданные
└── .gitignore
```

## Быстрый старт

### Требования

- **Python** 3.10+
- **Node.js** 18+
- **npm** (устанавливается вместе с Node.js)

### 1. Клонирование репозитория

```bash
git clone https://github.com/ВАШ_ЛОГИН/Diplom.git
cd Diplom
```

### 2. Настройка Backend

```bash
# Создаём виртуальное окружение
python -m venv .venv

# Активируем его (Windows PowerShell)
.\.venv\Scripts\activate

# Устанавливаем зависимости
pip install -r backend/requirements.txt
```

### 3. Настройка Frontend

```bash
cd frontend
npm install
cd ..
```

### 4. Запуск (нужны два терминала одновременно)

**Терминал 1 — Backend (FastAPI):**
```bash
cd backend
..\.venv\Scripts\activate
uvicorn main:app --reload
```
Сервер запустится на `http://127.0.0.1:8000`

**Терминал 2 — Frontend (React):**
```bash
cd frontend
npm run dev
```
Приложение откроется на `http://localhost:5173`

### 5. Использование

1. Откройте `http://localhost:5173` в браузере
2. Загрузите чёрно-белое изображение (карту высот) через кнопку **«Карта высот»**
3. Загрузите JSON-файл с метеоданными через кнопку **«Метеоданные»** (пример в `tests/weather_test.json`)
4. Управляйте видимостью слоёв (рельеф, туман, ветер, землетрясения) через чекбоксы
5. Вращайте 3D-сцену мышкой, масштабируйте колёсиком

## API-документация

После запуска бэкенда доступна автогенерируемая документация:
- **Swagger UI:** `http://127.0.0.1:8000/docs`
- **ReDoc:** `http://127.0.0.1:8000/redoc`

### Эндпоинты

| Метод | URL | Описание |
|-------|-----|----------|
| `POST` | `/api/v1/terrain/process-heightmap` | Загрузка и обработка карты высот (OpenCV) |
| `GET`  | `/api/v1/terrain/maps` | Список загруженных карт (CM_003) |
| `POST` | `/api/v1/weather/upload` | Загрузка и валидация JSON метеоданных |
| `GET`  | `/api/v1/weather/report/{id}` | Сводный отчёт по загрузке (MET_004) |

## Формат метеоданных (JSON)

```json
{
  "earthquakes": [
    { "magnitude": 5.5, "depth_km": 12.0, "lat": 40.2, "lon": 30.3 }
  ],
  "fog": {
    "density_percent": 85.0,
    "layer_thickness_km": 3.5
  },
  "wind": {
    "speed_ms": 15.0,
    "azimuth_deg": 135.0
  }
}
```

## Лицензия

Учебный проект. Все права защищены.
