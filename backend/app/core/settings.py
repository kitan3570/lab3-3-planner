from dotenv import load_dotenv
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "dev"
    database_url: str = "sqlite:///./app.db"

    weather_api_key: str | None = None
    llm_api_key: str | None = Field(default=None, validation_alias=AliasChoices("LLM_API_KEY"))

    qweather_host: str | None = Field(default=None, validation_alias=AliasChoices("YOUR_QWEATHER_HOST", "QWEATHER_HOST"))
    qweather_key: str | None = Field(default=None, validation_alias=AliasChoices("YOUR_QWEATHER_KEY", "QWEATHER_KEY"))

    deepseek_api_key: str | None = Field(default=None, validation_alias=AliasChoices("DEEPSEEK_API_KEY", "LLM_API_KEY"))
    deepseek_base_url: str = Field(default="https://api.deepseek.com/v1", validation_alias=AliasChoices("DEEPSEEK_BASE_URL"))
    deepseek_model: str = Field(default="deepseek-chat", validation_alias=AliasChoices("DEEPSEEK_MODEL"))


settings = Settings()
