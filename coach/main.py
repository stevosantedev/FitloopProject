from datetime import date
from statistics import mean
import os
from typing import Literal, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field
import httpx

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
    style: Literal["gentle", "direct"] = "gentle"
    focus: Literal["energy", "consistency", "recovery"] = "energy"


def wording(message: str, style: str) -> str:
    """Change the tone without changing the rule or its safety limits."""
    if style == "direct":
        return message.replace("If your schedule allows, try", "Try")
    if style == "gentle":
        return message
    return message



class RecentExercise(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    reps: int = Field(ge=1, le=500)
    weightKg: Optional[float] = Field(default=None, ge=0, le=1000)


class RecentSession(BaseModel):
    date: date
    routine: Optional[str] = Field(default=None, max_length=100)
    exercises: list[RecentExercise] = Field(default_factory=list, max_length=30)


class ConversationContext(BaseModel):
    recentSessions: list[RecentSession] = Field(default_factory=list, max_length=5)


class ConversationRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    style: Literal["gentle", "direct"] = "gentle"
    focus: Literal["energy", "consistency", "recovery"] = "energy"
    context: ConversationContext = Field(default_factory=ConversationContext)
    # Consent is per account and defaults off; provider credentials alone never enable AI.
    aiEnabled: bool = False


@app.get("/health")
def health():
    # Deployment checks can verify the service without sending any user measurements.
    return {"status": "ok", "service": "fitloop-coach"}



def training_progress_summary(sessions: list[RecentSession]) -> list[str]:
    """Compare the highest logged load for the same movement across distinct sessions.

    This describes recorded loads only; it does not estimate one-rep max or claim
    that a load change proves a change in strength.
    """
    by_exercise: dict[str, dict[str, tuple[str, float]]] = {}
    display_names: dict[str, str] = {}
    for session in sorted(sessions, key=lambda item: item.date):
        session_best: dict[str, float] = {}
        for exercise in session.exercises:
            if exercise.weightKg is None:
                continue
            key = exercise.name.casefold().strip()
            if not key:
                continue
            display_names.setdefault(key, exercise.name)
            session_best[key] = max(session_best.get(key, exercise.weightKg), exercise.weightKg)
        for key, load in session_best.items():
            by_exercise.setdefault(key, {})[session.date.isoformat()] = (session.date.isoformat(), load)

    comparisons = []
    for key, entries in by_exercise.items():
        ordered = sorted(entries.values(), key=lambda item: item[0])
        if len(ordered) < 2:
            continue
        previous_date, previous_load = ordered[-2]
        latest_date, latest_load = ordered[-1]
        name = display_names[key]
        if latest_load > previous_load:
            change = f"rose by {latest_load - previous_load:g} kg"
        elif latest_load < previous_load:
            change = f"was {previous_load - latest_load:g} kg lower"
        else:
            change = "was unchanged"
        comparisons.append(
            f"{name}: the highest logged load {change} "
            f"({previous_load:g} kg on {previous_date} to {latest_load:g} kg on {latest_date})."
        )
    return comparisons


@app.post("/coach/conversation")
def conversation(payload: ConversationRequest):
    """Provide a transparent rule-guided conversation starter until a reviewed model provider is enabled."""
    message = payload.message.strip()
    lowered = message.casefold()

    # This early safety route avoids pretending to diagnose pain or medical symptoms.
    urgent_terms = ("chest pain", "faint", "fainted", "cannot breathe", "can't breathe", "severe dizziness")
    injury_terms = ("injury", "injured", "pain", "hurt", "swollen", "strain", "tear")
    if any(term in lowered for term in urgent_terms):
        reply = (
            "Please stop exercising. Chest pain, fainting or serious breathing difficulty may require emergency medical attention. "
            "Seek emergency help now if symptoms are severe, sudden or ongoing. I cannot assess symptoms or diagnose a cause."
        )
    elif any(term in lowered for term in injury_terms):
        reply = (
            "I can't diagnose an injury or tell you whether it is safe to train through pain. Stop or modify the movement that causes pain, "
            "and consider advice from a qualified healthcare professional, especially if symptoms are severe, worsening or persistent. "
            "If you want, tell me which movement is uncomfortable and I can help identify non-medical training alternatives to discuss."
        )
    elif any(term in lowered for term in ("progress", "stronger", "getting stronger", "improve", "lifting more")):
        sessions = payload.context.recentSessions
        if not sessions:
            reply = (
                "I don't have any recent completed workouts to compare yet. Log a few sessions and I can help you review the exercises, "
                "loads and repetitions you've recorded. What strength or training goal are you working towards?"
            )
        else:
            exercise_names = []
            for session in sessions:
                for exercise in session.exercises:
                    if exercise.name not in exercise_names:
                        exercise_names.append(exercise.name)
            latest_session = max(sessions, key=lambda item: item.date)
            latest_movements = []
            for exercise in latest_session.exercises:
                if exercise.name not in latest_movements:
                    latest_movements.append(exercise.name)
            comparisons = training_progress_summary(sessions)
            comparison_text = " ".join(comparisons[:3])
            if comparison_text:
                comparison_text += (
                    " These are comparisons of the highest loads recorded for the same movement; "
                    "rep ranges, technique and session conditions can differ, so they are not a definitive strength test."
                )
            else:
                comparison_text = (
                    " I don't yet have two separate sessions with a recorded load for the same movement, "
                    "so I can't make a like-for-like load comparison."
                )
            reply = (
                f"I can see {len(sessions)} recent completed workout(s) in your FitLoop history, covering "
                f"{len(exercise_names)} distinct movement(s). Your latest recorded session was "
                f"{latest_session.date.isoformat()} and included "
                f"{', '.join(latest_movements[:6]) if latest_movements else 'no completed exercise sets'}. "
                f"{comparison_text} Which lift or performance goal would you like to review?"
            )
    elif any(term in lowered for term in ("workout", "routine", "plan", "programme", "program")):
        reply = (
            "I can help you think through a training plan, but I won't change or save a routine without your confirmation. "
            "To make a useful starting point, tell me your main goal, how many days each week you can train, "
            "what equipment you have and your training experience."
        )
    elif any(term in lowered for term in ("hello", "hi", "hey")):
        reply = (
            "Hi — I'm FitLoop's early guided coach. I can help you reflect on logged training, understand exercise guidance "
            "and think through a routine. What would you like to work on?"
        )
    else:
        reply = (
            "I can help with training plans, exercise guidance and reviewing the workouts you've logged. "
            "Tell me your goal and a little about your current training so I can make the next step more relevant."
        )

    # A model is used only when the account owner has opted in and an operator has
    # configured a provider key. Safety routes above always remain rule-guided.
    if payload.aiEnabled and os.getenv("AI_COACH_API_KEY"):
        try:
            generated = generate_ai_reply(payload)
            if generated:
                return {"message": generated, "responseMode": "ai_generated"}
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            # A provider outage must not prevent the user from receiving the safe fallback.
            pass

    return {"message": wording(reply, payload.style), "responseMode": "guided_rules"}


def generate_ai_reply(payload: ConversationRequest) -> str | None:
    """Request a grounded training reply without sending account identifiers or wellbeing logs."""
    api_key = os.getenv("AI_COACH_API_KEY")
    model = os.getenv("AI_COACH_MODEL", "gpt-4.1-mini")
    if not api_key:
        return None

    context = [
        {
            "date": session.date.isoformat(),
            "routine": session.routine,
            "exercises": [
                {"name": item.name, "reps": item.reps, "weightKg": item.weightKg}
                for item in session.exercises
            ],
        }
        for session in payload.context.recentSessions
    ]
    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "temperature": 0.4,
            "max_tokens": 350,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are FitLoop's fitness and habit coach. Give concise, practical, non-judgemental "
                        "training guidance. Use only the supplied workout facts; say when information is missing. "
                        "Do not diagnose, interpret symptoms, prescribe treatment, recommend training through pain, "
                        "or claim certainty about health or strength. Do not invent measurements, goals or completed "
                        "workouts. Do not create or save plans. If asked for medical advice, explain your limits and "
                        "suggest an appropriate qualified professional. Never encourage extreme exercise, food "
                        "restriction or unsafe weight changes. Ask at most one useful follow-up question. "
                        f"Use a {payload.style} tone and focus on {payload.focus}."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"User message: {payload.message}\n"
                        f"Recent completed workout summaries (may be empty): {context}"
                    ),
                },
            ],
        },
        timeout=15.0,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    if not isinstance(content, str):
        return None
    cleaned = content.strip()
    return cleaned[:3000] if cleaned else None


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
                "message": wording(
                    "Your recent sleep averages are lower. If it feels practical, consider protecting a little time for rest."
                    if payload.focus == "recovery"
                    else "Your sleep has been lower over the last few check-ins. If your schedule allows, try protecting a little more time for rest.",
                    payload.style
                ),
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

    # Consistency prompts are based on logging frequency, not a judgement about missed targets.
    if not messages and payload.focus == "consistency" and 1 <= len(logs) < 5:
        messages.append({
            "kind": "consistency_reflection",
            "message": wording("You have logged a few check-ins. A small routine that fits your week may make it easier to keep the habit going.", payload.style),
            "metric": "daysLogged",
            "reasons": [
                f"{len(logs)} daily check-ins are available in the recent history.",
                "The prompt is about making logging convenient, not reaching a required streak."
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
