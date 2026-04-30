from __future__ import annotations

import httpx

from app.third_party.errors import ThirdPartyUpstreamError


async def get_json(url: str, *, headers: dict[str, str] | None = None, timeout_s: float = 20) -> dict:
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        try:
            res = await client.get(url, headers=headers)
            res.raise_for_status()
            return res.json()
        except httpx.HTTPError as e:
            raise ThirdPartyUpstreamError(str(e)) from e

