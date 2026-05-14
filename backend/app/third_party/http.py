from __future__ import annotations

import httpx

from app.third_party.errors import ThirdPartyUpstreamError


async def get_json(url: str, *, headers: dict[str, str] | None = None, timeout_s: float = 20) -> dict:
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        try:
            res = await client.get(url, headers=headers)
            res.raise_for_status()
            return res.json()
        except httpx.HTTPStatusError as e:
            body = ""
            try:
                body = (e.response.text or "")[:400]
            except Exception:
                body = ""
            msg = f"HTTP {e.response.status_code} for url '{e.request.url}'"
            if body:
                msg += f" body={body}"
            raise ThirdPartyUpstreamError(msg) from e
        except httpx.HTTPError as e:
            msg = str(e) or repr(e)
            raise ThirdPartyUpstreamError(msg) from e


async def post_json(
    url: str,
    *,
    json_body: dict,
    headers: dict[str, str] | None = None,
    timeout_s: float = 20,
) -> dict:
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        try:
            res = await client.post(url, headers=headers, json=json_body)
            res.raise_for_status()
            return res.json()
        except httpx.HTTPStatusError as e:
            body = ""
            try:
                body = (e.response.text or "")[:400]
            except Exception:
                body = ""
            msg = f"HTTP {e.response.status_code} for url '{e.request.url}'"
            if body:
                msg += f" body={body}"
            raise ThirdPartyUpstreamError(msg) from e
        except httpx.HTTPError as e:
            msg = str(e) or repr(e)
            raise ThirdPartyUpstreamError(msg) from e
