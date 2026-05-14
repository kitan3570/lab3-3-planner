from __future__ import annotations

import json
import re

from app.core.settings import settings
from app.third_party.errors import ThirdPartyAuthError, ThirdPartyUpstreamError
from app.third_party.http import post_json


_HEADERS = [
    "【总体摘要】",
    "【行程安排建议（上午）】",
    "【行程安排建议（下午）】",
    "【行程安排建议（晚上）】",
    "【预算与花费】",
    "【风险与备选方案】",
]


def _extract_last_complete_block(text: str) -> str:
    lines = [ln.strip() for ln in text.splitlines()]
    header_re = re.compile(r"^【.+】$")

    indices: list[int] = [i for i, ln in enumerate(lines) if ln == _HEADERS[0]]
    if not indices:
        return text.strip()

    best: str | None = None
    for start in indices:
        pos = start
        sections: dict[str, list[str]] = {}
        for h in _HEADERS:
            try:
                h_idx = lines.index(h, pos)
            except ValueError:
                sections = {}
                break
            j = h_idx + 1
            content: list[str] = []
            while j < len(lines) and not (header_re.match(lines[j]) and lines[j] in _HEADERS):
                ln = lines[j].strip()
                if ln:
                    content.append(ln)
                j += 1
            if content:
                sections[h] = content
            pos = j
        if sections and all(h in sections for h in _HEADERS):
            out_lines: list[str] = []
            for h in _HEADERS:
                out_lines.append(h)
                content = sections[h][:4]
                out_lines.extend(content)
                out_lines.append("")
            best = "\n".join(out_lines).strip()

    return best or "\n".join(lines[indices[-1] :]).strip()


def _has_all_headers(text: str) -> bool:
    for h in _HEADERS:
        if h not in text:
            return False
    return True


def _sanitize_plain_text(text: str) -> str:
    t = text.replace("**", "")
    t = re.sub(r"(?m)^\s*#{1,6}\s*", "", t)
    t = re.sub(r"(?m)^\s*[-*]\s+", "", t)
    t = re.sub(r"(?m)^\s*\d+\.\s+", "", t)
    t = t.strip()

    t = _extract_last_complete_block(t)

    lines: list[str] = []
    for raw in t.splitlines():
        line = raw.strip()
        if not line:
            lines.append("")
            continue
        if "API Base" in line or "API Base:" in line:
            continue
        if line.startswith("约束条件") or line.startswith("约束条件：") or line.startswith("约束条件:"):
            continue
        if line.startswith("对照约束条件") or line.startswith("对照约束"):
            continue
        if line.startswith("构思") or line.startswith("构思：") or line.startswith("构思:"):
            continue
        if line.startswith("草稿：") or line.startswith("草稿:"):
            line = line.split("：", 1)[-1].strip()
        if line.endswith("】") and not line.startswith("【"):
            line = f"【{line[:-1]}】"
        if line.startswith("分析请求") or line.startswith("处理输入数据") or line.startswith("起草内容") or line.startswith("审查"):
            continue
        if line.startswith("输出格式") or line.startswith("内容限制") or line.startswith("输入：") or line.startswith("角色："):
            continue
        if line.startswith("每段用") and "不要泄露" in line:
            continue
        if line.startswith("最终检查") or line.startswith("最终校验") or line.startswith("检查结果"):
            continue
        if (
            line.startswith("格式检查")
            or line.startswith("段落行数")
            or line.startswith("字数统计")
            or line.startswith("扩充内容")
            or line.startswith("扩写")
            or line.startswith("补充内容")
        ):
            continue
        if line.startswith("需要") and "：" in line:
            continue
        if line.startswith("每段") and ("行" in line or "检查" in line):
            continue
        if "让我们检查" in line or "检查行数" in line:
            continue
        if ("？" in line or "?" in line) and ("是。" in line or "是的" in line or "已检查" in line) and (
            "不要" in line
            or "Markdown" in line
            or "分段" in line
            or "表格" in line
            or line.startswith("专业的出行规划助手")
            or line.startswith("排版好的中文纯文本")
        ):
            continue
        if line.startswith("*") or line.startswith("•"):
            line = line.lstrip("*• ").strip()
        lines.append(line)

    out = "\n".join(lines).strip()
    while "\n\n\n" in out:
        out = out.replace("\n\n\n", "\n\n")
    return out


async def generate_text(*, system_prompt: str, user_prompt: str) -> str:
    api_key = (settings.deepseek_api_key or "").strip().strip("`").strip('"').strip("'")
    if not api_key:
        raise ThirdPartyAuthError("DEEPSEEK_API_KEY is missing")

    base_url = str(settings.deepseek_base_url).strip().strip("`").strip('"').strip("'").rstrip("/")
    url = f"{base_url}/chat/completions"
    model = str(settings.deepseek_model).strip().strip("`").strip('"').strip("'")

    async def call_llm(extra_user_prompt: str | None = None) -> tuple[str, str | None]:
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        if extra_user_prompt:
            messages.append({"role": "user", "content": extra_user_prompt})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.6,
            "max_tokens": 2800,
        }
        res = await post_json(url, json_body=payload, headers={"Authorization": f"Bearer {api_key}"}, timeout_s=60)
        choice = res["choices"][0]
        msg = choice["message"]
        content = msg.get("content")
        if not content:
            content = msg.get("reasoning_content") or ""
        return str(content), choice.get("finish_reason")

    try:
        raw1, finish1 = await call_llm()
        text1 = _sanitize_plain_text(raw1)
        if text1 and _has_all_headers(text1) and finish1 != "length":
            return text1

        extra = (
            "请重新生成一次最终建议正文：必须从【总体摘要】开始，包含6个标题且每段2-4行，"
            "全文尽量控制在600-900字以内。只输出最终正文，不要输出构思/草稿/自检/提示语。"
        )
        raw2, _finish2 = await call_llm(extra)
        text2 = _sanitize_plain_text(raw2)
        if text2 and _has_all_headers(text2):
            return text2

        snippet = json.dumps({"first_finish": finish1, "first": raw1[:500], "second": raw2[:500]}, ensure_ascii=False)
        raise ThirdPartyUpstreamError(f"LLM output incomplete: {snippet}")
    except ThirdPartyUpstreamError:
        raise
    except Exception as e:
        raise ThirdPartyUpstreamError(f"Unexpected DeepSeek response: {e}") from e
