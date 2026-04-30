from __future__ import annotations

from app.core.settings import settings
from app.third_party.errors import ThirdPartyAuthError, ThirdPartyUpstreamError
from app.third_party.http import post_json


async def generate_text(*, system_prompt: str, user_prompt: str) -> str:
    if not settings.deepseek_api_key:
        raise ThirdPartyAuthError("DEEPSEEK_API_KEY is missing")

    base_url = settings.deepseek_base_url.rstrip("/")
    url = f"{base_url}/chat/completions"

    payload = {
        "model": settings.deepseek_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.6,
        "max_tokens": 900,
    }

    res = await post_json(url, json_body=payload, headers={"Authorization": f"Bearer {settings.deepseek_api_key}"}, timeout_s=60)

    try:
        return str(res["choices"][0]["message"]["content"])
    except Exception as e:
        raise ThirdPartyUpstreamError(f"Unexpected DeepSeek response: {e}") from e
