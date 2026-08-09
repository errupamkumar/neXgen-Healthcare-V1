# -*- coding: utf-8 -*-
# SPDX-License-Identifier: Apache-2.0

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

# MySQL Connection Details - can be loaded from .env
DB_HOST = os.getenv("MYSQL_HOST", "localhost")
DB_USER = os.getenv("MYSQL_USER", "root")
DB_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
DB_NAME = os.getenv("MYSQL_DATABASE", "healthcentral")
DB_PORT = os.getenv("MYSQL_PORT", "3306")

# Database connection URL using pymysql
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

# Create Database Engine
try:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20
    )
except Exception as e:
    # Fallback to sqlite for ease of developer evaluation if MySQL is not available
    print(f"MySQL connection setup failed: {e}. Falling back to SQLite for local development simulation.")
    DATABASE_URL = "sqlite:///./healthcentral.db"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Dependency helper to supply database sessions to API routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
