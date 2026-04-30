from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.database import get_db, init_db
from app.models import Location, Plan
from app.schemas import LocationCreate, LocationRead, PlanCreate, PlanRead
from app.third_party.clients.weather_client import get_weather_summary

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


__all__ = ["app"]
