from datetime import date
from statistics import mean
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="FitLoop Coach", version="0.1.0")


class DailyMetric(BaseModel):
    """A small daily snapshot; account identity is deliberately not part of this model."""

    date: date
    sleepMinutes: Optional[int] = Field(default=None, ge=0, le=1440)
    steps: Optional[int] = Field(default=None, ge=0, le=200000)
    activityMinutes: Optional[int] = Field(default=None, ge=0, le=1440)
    mood: Optional[int] = Field(default=None, ge=1, le=5)
    focusMinutes: Optional[int] = Field(default=None, ge=0, le=1440)


class CheckInRequest(BaseModel):
    """The service accepts a short history so trends are less affected by one unusual day."""

    logs: list[DailyMetric] = Field(default_factory=list, max_length=30)
    style: str = "gentle"
    focus: str = "energy"


def wording(message: str, style: str) -> str:
    """Change the tone without changing the rule or its safety limits."""
    if style == "direct":
        return message.replace("If your schedule allows, try", "Try")
    if style == "gentle":
        return message
    return message


@app.get("/health")
def health():
    # Deployment checks can verify the service without sending any user measurements.
    return {"status": "ok", "service": "fitloop-coach"}


@app.post("/coach/check-in")
def check_in(payload: CheckInRequest):
    """Return cautious prompts with the measurements and rule behind each suggestion."""
    logs = sorted(payload.logs, key=lambda item: item.date)
    messages = []

    # Require at least three sleep records before comparing periods; missing days are not zeroes.
    sleep_values = [item.sleepMinutes for item in logs if item.sleepMinutes is not None]
    if len(sleep_values) >= 5:
        recent = sleep_values[-3:]
        earlier = sleep_values[:-3]
        if earlier and mean(recent) < mean(earlier) - 60:
            messages.append({
                "kind": "sleep_trend",
                "message": wording("Your sleep has been lower over the last few check-ins. If your schedule allows, try protecting a little more time for rest.", payload.style),
                "metric": "sleepMinutes",
                "reasons": [
                    f"Recent three recorded days average {mean(recent) / 60:.1f} hours.",
                    f"Earlier recorded days average {mean(earlier) / 60:.1f} hours.",
                    "The one-hour difference is a prompt for reflection, not a health threshold."
                ]
            })

    # An unlogged step count is unknown, so the comparison uses only days with a recorded value.
    step_values = [item.steps for item in logs if item.steps is not None]
    if len(step_values) >= 4 and mean(step_values[-2:]) < mean(step_values[:-2]) * 0.6:
        messages.append({
            "kind": "activity_change",
            "message": wording("Your logged steps have dipped recently. A short walk when it fits your day may be an easy way to get moving.", payload.style),
            "metric": "steps",
            "reasons": [
                f"Latest two recorded days average {mean(step_values[-2:]):.0f} steps.",
                f"Earlier recorded days average {mean(step_values[:-2]):.0f} steps.",
                "Only days with a recorded step count are compared."
            ]
        })

    # A quiet period should not be treated as failure; the default response avoids guilt-based nudges.
    if not messages:
        messages.append({
            "kind": "steady_check_in",
            "message": "Keep logging what feels useful. A few check-ins are enough to start noticing your own patterns.",
            "metric": None,
            "reasons": ["No clear change in the available recent measurements triggered a coaching rule."]
        })

    return {"messages": messages}
