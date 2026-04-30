from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.database import get_db, init_db
from app.models import Location, Plan
from app.schemas import AISummaryResponse, LocationCreate, LocationRead, LocationUpdate, PlanCreate, PlanRead, PlanSummary
from app.third_party.clients.deepseek_client import generate_text
from app.third_party.clients.weather_client import get_weather_summary
from app.third_party.errors import ThirdPartyAuthError, ThirdPartyUpstreamError

app = FastAPI(title="Lab 3-2 智能出行规划器 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"http://localhost:\d+|http://127\.0\.0\.1:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/plans", response_model=PlanRead)
@app.post("/api/plans/", response_model=PlanRead, include_in_schema=False)
def create_plan(payload: PlanCreate, db: Session = Depends(get_db)) -> Plan:
    plan = Plan(
        title=payload.title,
        date=payload.date,
        budget=payload.budget,
        people_count=payload.people_count,
        preferences=payload.preferences,
        remarks=payload.remarks,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    plan.locations = []
    return plan


@app.get("/api/plans", response_model=list[PlanSummary])
@app.get("/api/plans/", response_model=list[PlanSummary], include_in_schema=False)
def list_plans(db: Session = Depends(get_db)) -> list[Plan]:
    stmt = select(Plan).order_by(Plan.id.desc())
    return db.execute(stmt).scalars().all()


@app.get("/api/plans/{plan_id}", response_model=PlanRead)
@app.get("/api/plans/{plan_id}/", response_model=PlanRead, include_in_schema=False)
async def get_plan(plan_id: int, db: Session = Depends(get_db)) -> Plan:
    stmt = select(Plan).options(joinedload(Plan.locations)).where(Plan.id == plan_id)
    plan = db.execute(stmt).scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    for loc in plan.locations:
        loc.weather = await get_weather_summary(lat=loc.lat, lng=loc.lng)
    return plan


@app.post("/api/plans/{plan_id}/locations", response_model=LocationRead)
@app.post("/api/plans/{plan_id}/locations/", response_model=LocationRead, include_in_schema=False)
async def add_location(plan_id: int, payload: LocationCreate, db: Session = Depends(get_db)) -> Location:
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    location = Location(
        plan_id=plan_id,
        name=payload.name,
        lat=payload.lat,
        lng=payload.lng,
        day_index=payload.day_index,
        time_slot=payload.time_slot,
        estimated_cost=payload.estimated_cost,
        duration=payload.duration,
        remarks=payload.remarks,
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    location.weather = await get_weather_summary(lat=location.lat, lng=location.lng)
    return location


@app.put("/api/plans/{plan_id}/locations/{location_id}", response_model=LocationRead)
@app.put(
    "/api/plans/{plan_id}/locations/{location_id}/",
    response_model=LocationRead,
    include_in_schema=False,
)
async def update_location(
    plan_id: int,
    location_id: int,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
) -> Location:
    location = db.get(Location, location_id)
    if not location or location.plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Location not found")

    if payload.time_slot is not None:
        location.time_slot = payload.time_slot
    if payload.day_index is not None:
        location.day_index = payload.day_index
    if payload.estimated_cost is not None:
        location.estimated_cost = payload.estimated_cost
    if payload.duration is not None:
        location.duration = payload.duration
    if payload.remarks is not None:
        location.remarks = payload.remarks

    db.add(location)
    db.commit()
    db.refresh(location)
    location.weather = await get_weather_summary(lat=location.lat, lng=location.lng)
    return location


@app.delete("/api/plans/{plan_id}/locations/{location_id}", status_code=204)
@app.delete("/api/plans/{plan_id}/locations/{location_id}/", status_code=204, include_in_schema=False)
def delete_location(plan_id: int, location_id: int, db: Session = Depends(get_db)) -> Response:
    location = db.get(Location, location_id)
    if not location or location.plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Location not found")

    db.delete(location)
    db.commit()
    return Response(status_code=204)


@app.delete("/api/plans/{plan_id}", status_code=204)
@app.delete("/api/plans/{plan_id}/", status_code=204, include_in_schema=False)
def delete_plan(plan_id: int, db: Session = Depends(get_db)) -> Response:
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    db.delete(plan)
    db.commit()
    return Response(status_code=204)


@app.post("/api/plans/{plan_id}/ai-summary", response_model=AISummaryResponse)
@app.post("/api/plans/{plan_id}/ai-summary/", response_model=AISummaryResponse, include_in_schema=False)
async def ai_summary(plan_id: int, db: Session = Depends(get_db)) -> AISummaryResponse:
    stmt = select(Plan).options(joinedload(Plan.locations)).where(Plan.id == plan_id)
    plan = db.execute(stmt).scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    locations = list(plan.locations)
    for loc in locations:
        loc.weather = await get_weather_summary(lat=loc.lat, lng=loc.lng)

    total_locations_cost = float(sum((loc.estimated_cost or 0) for loc in locations))
    total_duration = int(sum((loc.duration or 0) for loc in locations))

    slot_cost: dict[str, float] = {"上午": 0.0, "下午": 0.0, "晚上": 0.0}
    for loc in locations:
        slot = str(loc.time_slot)
        if slot in slot_cost:
            slot_cost[slot] += float(loc.estimated_cost or 0)

    budget_left = float(plan.budget) - total_locations_cost

    system_prompt = (
        "你是一个专业的出行规划助手。你将根据用户的出行规划信息、地点清单、天气与预算情况，"
        "输出一段排版好的中文纯文本建议（不要使用 Markdown 语法，不要使用表格，不要用 #、-、* 等标记）。\n"
        "请用以下固定分段标题格式输出：\n"
        "【总体摘要】\n"
        "【行程安排建议（上午）】\n"
        "【行程安排建议（下午）】\n"
        "【行程安排建议（晚上）】\n"
        "【预算与花费】\n"
        "【风险与备选方案】\n"
        "每段用 2-6 行自然语言给出可执行建议。不要泄露任何密钥信息。"
    )

    lines: list[str] = []
    lines.append(f"出行规划：{plan.title}")
    lines.append("")
    lines.append(f"日期：{plan.date}")
    lines.append(f"人数：{plan.people_count}")
    lines.append(f"预算：¥{plan.budget}")
    if plan.preferences:
        lines.append(f"偏好：{plan.preferences}")
    if plan.remarks:
        lines.append(f"备注：{plan.remarks}")
    lines.append("")
    lines.append("地点清单：")
    lines.append("")
    for loc in locations:
        w = getattr(loc, "weather", None) or {}
        weather_text = w.get("summary") if w.get("ok") else "天气不可用"
        remarks = loc.remarks or ""
        extra = f"；备注：{remarks}" if remarks else ""
        lines.append(
            f"{loc.time_slot}｜{loc.name}｜{weather_text}｜¥{loc.estimated_cost:.0f}｜{loc.duration}分钟{extra}"
        )
    lines.append("")
    lines.append("花费汇总：")
    lines.append("")
    lines.append(f"地点预计花费合计：¥{total_locations_cost:.0f}")
    lines.append(f"总停留时长：{total_duration} 分钟")
    lines.append(f"上午/下午/晚上花费：¥{slot_cost['上午']:.0f} / ¥{slot_cost['下午']:.0f} / ¥{slot_cost['晚上']:.0f}")
    lines.append(f"预算差额：¥{budget_left:.0f}（正数=剩余，负数=超支）")

    user_prompt = "\n".join(lines)

    try:
        text = await generate_text(system_prompt=system_prompt, user_prompt=user_prompt)
        return AISummaryResponse(text=text)
    except ThirdPartyAuthError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ThirdPartyUpstreamError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


__all__ = ["app"]
