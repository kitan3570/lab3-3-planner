from app.core.settings import settings
from app.third_party.errors import ThirdPartyAuthError
from app.third_party.http import get_json


async def get_weather_summary(*, lat: float, lon: float) -> dict:
    if not settings.weather_api_key:
        raise ThirdPartyAuthError("WEATHER_API_KEY is missing")

    url = f"https://example.com/weather?lat={lat}&lon={lon}"
    return await get_json(url, headers={"Authorization": f"Bearer {settings.weather_api_key}"})

