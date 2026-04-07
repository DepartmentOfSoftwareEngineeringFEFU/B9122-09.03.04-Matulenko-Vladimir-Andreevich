import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

# Используем SQLite для локального MVP, чтобы проект работал "из коробки" без установки PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./weather_db.db")

# Включаем echo=True для отображения логов SQL в консоли
engine = create_async_engine(DATABASE_URL, echo=True)

# Создаем фабрику асинхронных сессий
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Базовый класс для всех моделей (таблиц)
Base = declarative_base()

# Генератор сессий для Dependency Injection в FastAPI
async def get_db():
    async with async_session() as session:
        yield session
