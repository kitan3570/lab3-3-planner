from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.database import get_db, init_db
from app.models import Location, Plan
from app.schemas import LocationCreate, LocationRead, PlanCreate, PlanRead

app = FastAPI(title="Lab 3-2 智能出行规划器 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
def get_plan(plan_id: int, db: Session = Depends(get_db)) -> Plan:
    stmt = select(Plan).options(joinedload(Plan.locations)).where(Plan.id == plan_id)
    plan = db.execute(stmt).scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@app.post("/api/plans/{plan_id}/locations", response_model=LocationRead)
def add_location(plan_id: int, payload: LocationCreate, db: Session = Depends(get_db)) -> Location:
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
    return location


__all__ = ["app"]
