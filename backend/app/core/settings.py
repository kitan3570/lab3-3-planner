from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "dev"
    database_url: str = "sqlite:///./app.db"

    weather_api_key: str | None = None
    llm_api_key: str | None = None

    qweather_host: str | None = Field(default=None, validation_alias=AliasChoices("YOUR_QWEATHER_HOST", "QWEATHER_HOST"))
    qweather_key: str | None = Field(default=None, validation_alias=AliasChoices("YOUR_QWEATHER_KEY", "QWEATHER_KEY"))


settings = Settings()
