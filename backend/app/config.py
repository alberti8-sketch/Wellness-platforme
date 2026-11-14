"""
Configuration and environment settings.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""
    
    # Database
    database_url: str = "sqlite:///./wellness.db"
    
    # API
    api_title: str = "Wellness & Population Health Analytics"
    api_version: str = "1.0.0"
    debug: bool = False
    
    # Frontend
    frontend_url: str = "http://localhost:3000"
    
    # Upload
    max_upload_size: int = 10_485_760  # 10MB
    
    # Logging
    log_level: str = "INFO"
    
    class Config:
        env_file = ".env"


settings = Settings()
