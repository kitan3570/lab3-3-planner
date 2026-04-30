from __future__ import annotations

from time import time

from app.core.settings import settings
from app.third_party.errors import ThirdPartyAuthError, ThirdPartyUpstreamError
from app.third_party.http import get_json

_cache: dict[str, tuple[float, dict]] = {}


def _cache_key(lat: float, lng: float) -> str:
    return f"{round(lat, 3)}:{round(lng, 3)}"


def _get_cached(lat: float, lng: float) -> dict | None:
    key = _cache_key(lat, lng)
    item = _cache.get(key)
    if not item:
        return None
    expires_at, value = item
    if expires_at < time():
        _cache.pop(key, None)
        return None
    return value


def _set_cache(lat: float, lng: float, value: dict, ttl_s: int) -> None:
    _cache[_cache_key(lat, lng)] = (time() + ttl_s, value)


async def get_weather_summary(*, lat: float, lng: float) -> dict:
    cached = _get_cached(lat, lng)
    if cached is not None:
        return cached

    if not settings.qweather_host or not settings.qweather_key:
        err = ThirdPartyAuthError("QWeather credentials are missing")
        value = {"ok": False, "summary": None, "error": str(err)}
        _set_cache(lat, lng, value, ttl_s=30)
        return value

    host = settings.qweather_host.replace("https://", "").replace("http://", "").strip().strip("/")
    url = f"https://{host}/v7/weather/now?location={lng},{lat}&key={settings.qweather_key}"

    try:
        data = await get_json(url, timeout_s=5)
        code = str(data.get("code", ""))
        if code != "200":
            value = {"ok": False, "summary": None, "error": f"QWeather code={code}"}
            _set_cache(lat, lng, value, ttl_s=60)
            return value

        now = data.get("now") or {}
        text = str(now.get("text", "")).strip()
        temp = str(now.get("temp", "")).strip()
        summary = f"{text} {temp}°C".strip()
        value = {"ok": True, "summary": summary, "error": None}
        _set_cache(lat, lng, value, ttl_s=600)
        return value
    except ThirdPartyUpstreamError as e:
        value = {"ok": False, "summary": None, "error": str(e)}
        _set_cache(lat, lng, value, ttl_s=60)
        return value
