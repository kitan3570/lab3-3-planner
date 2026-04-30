from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict


TimeSlot = Literal["上午", "下午", "晚上"]


class WeatherInfo(BaseModel):
    ok: bool
    summary: str | None = None
    error: str | None = None


class AISummaryResponse(BaseModel):
    text: str


class PlanSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    date: date


class PlanCreate(BaseModel):
    title: str
    date: date
    budget: float
    people_count: int
    preferences: str | None = None
    remarks: str | None = None


class LocationCreate(BaseModel):
    name: str
    lat: float
    lng: float
    day_index: int = 1
    time_slot: TimeSlot
    estimated_cost: float
    duration: int
    remarks: str | None = None


class LocationUpdate(BaseModel):
    day_index: int | None = None
    time_slot: TimeSlot | None = None
    estimated_cost: float | None = None
    duration: int | None = None
    remarks: str | None = None


class LocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plan_id: int
    name: str
    lat: float
    lng: float
    day_index: int
    time_slot: TimeSlot
    estimated_cost: float
    duration: int
    remarks: str | None
    weather: WeatherInfo | None = None


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    date: date
    budget: float
    people_count: int
    preferences: str | None
    remarks: str | None
    locations: list[LocationRead]
