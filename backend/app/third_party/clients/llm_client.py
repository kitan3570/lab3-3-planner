from app.core.settings import settings
from app.third_party.errors import ThirdPartyAuthError
from app.third_party.http import get_json


async def generate_travel_advice(*, prompt: str) -> dict:
    if not settings.llm_api_key:
        raise ThirdPartyAuthError("LLM_API_KEY is missing")

    url = "https://example.com/llm"
    return await get_json(url, headers={"Authorization": f"Bearer {settings.llm_api_key}"})

