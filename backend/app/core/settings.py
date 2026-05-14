from pathlib import Path

from dotenv import load_dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_PATH), env_file_encoding="utf-8", extra="ignore")

    app_env: str = "dev"
    database_url: str = "sqlite:///./app.db"

    weather_api_key: str | None = None
    llm_api_key: str | None = Field(default=None, validation_alias=AliasChoices("LLM_API_KEY"))

    qweather_host: str | None = Field(default=None, validation_alias=AliasChoices("YOUR_QWEATHER_HOST", "QWEATHER_HOST"))
    qweather_key: str | None = Field(default=None, validation_alias=AliasChoices("YOUR_QWEATHER_KEY", "QWEATHER_KEY"))

    deepseek_api_key: str | None = Field(default=None, validation_alias=AliasChoices("DEEPSEEK_API_KEY", "LLM_API_KEY"))
    deepseek_base_url: str = Field(default="https://api.deepseek.com/v1", validation_alias=AliasChoices("DEEPSEEK_BASE_URL"))
    deepseek_model: str = Field(default="deepseek-chat", validation_alias=AliasChoices("DEEPSEEK_MODEL"))

    amap_js_key: str | None = Field(default=None, validation_alias=AliasChoices("AMAP_JS_KEY"))
    amap_web_key: str | None = Field(default=None, validation_alias=AliasChoices("AMAP_WEB_KEY"))
    amap_security_js_code: str | None = Field(default=None, validation_alias=AliasChoices("AMAP_SECURITY_JSCODE"))


settings = Settings()
