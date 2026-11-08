from datetime import date

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_empty_history_returns_a_non_alarmist_check_in():
    # An empty history should never be described as a negative trend or a missed target.
    response = client.post("/coach/check-in", json={"logs": []})
    assert response.status_code == 200
    message = response.json()["messages"][0]
    assert message["kind"] == "steady_check_in"
    assert message["reasons"]


def test_sleep_rule_explains_the_comparison():
    # Five observations are required so the recent three can be compared with earlier records.
    logs = [
        {"date": "2026-10-01", "sleepMinutes": 480},
        {"date": "2026-10-02", "sleepMinutes": 470},
        {"date": "2026-10-03", "sleepMinutes": 420},
        {"date": "2026-10-04", "sleepMinutes": 390},
        {"date": "2026-10-05", "sleepMinutes": 360},
    ]
    response = client.post("/coach/check-in", json={"logs": logs})
    assert response.status_code == 200
    message = response.json()["messages"][0]
    assert message["kind"] == "sleep_trend"
    assert any("average" in reason for reason in message["reasons"])


def test_consistency_focus_uses_a_low_pressure_logging_prompt():
    # The consistency preference changes the prompt without inventing a missed-goal judgement.
    response = client.post("/coach/check-in", json={
        "focus": "consistency",
        "logs": [
            {"date": "2026-10-01", "steps": 2000},
            {"date": "2026-10-04", "steps": 2500},
        ],
    })
    assert response.status_code == 200
    message = response.json()["messages"][0]
    assert message["kind"] == "consistency_reflection"
    assert any("not reaching a required streak" in reason for reason in message["reasons"])


def test_recovery_focus_changes_sleep_wording():
    # The recovery preference changes how the same sleep trend is framed.
    logs = [
        {"date": "2026-10-01", "sleepMinutes": 480},
        {"date": "2026-10-02", "sleepMinutes": 470},
        {"date": "2026-10-03", "sleepMinutes": 420},
        {"date": "2026-10-04", "sleepMinutes": 390},
        {"date": "2026-10-05", "sleepMinutes": 360},
    ]
    response = client.post("/coach/check-in", json={"focus": "recovery", "logs": logs})
    assert response.status_code == 200
    assert "recent sleep averages" in response.json()["messages"][0]["message"]


def test_conversation_gives_a_transparent_guided_reply_and_uses_training_context():
    response = client.post("/coach/conversation", json={
        "message": "Can you review my progress?",
        "context": {"recentSessions": [{
            "date": "2026-11-01",
            "routine": "Upper body",
            "exercises": [{"name": "Bench press", "reps": 8, "weightKg": 60}],
        }]},
    })
    assert response.status_code == 200
    result = response.json()
    assert result["responseMode"] == "guided_rules"
    assert "1 recent completed workout" in result["message"]
    assert "Bench press" in result["message"]


def test_progress_reply_compares_highest_logged_load_for_the_same_movement():
    response = client.post("/coach/conversation", json={
        "message": "Can you review my progress?",
        "context": {"recentSessions": [
            {"date": "2026-10-25", "exercises": [
                {"name": "Bench press", "reps": 8, "weightKg": 50},
                {"name": "Bench press", "reps": 6, "weightKg": 45},
            ]},
            {"date": "2026-11-01", "exercises": [
                {"name": "Bench press", "reps": 6, "weightKg": 60},
                {"name": "Bench press", "reps": 5, "weightKg": 55},
            ]},
        ]},
    })
    assert response.status_code == 200
    message = response.json()["message"]
    assert "latest recorded session was 2026-11-01" in message
    assert "Bench press: the highest logged load rose by 10 kg" in message
    assert "50 kg on 2026-10-25 to 60 kg on 2026-11-01" in message
    assert "not a definitive strength test" in message


def test_progress_reply_does_not_invent_a_load_comparison_for_bodyweight_only_logs():
    response = client.post("/coach/conversation", json={
        "message": "Am I getting stronger?",
        "context": {"recentSessions": [
            {"date": "2026-10-25", "exercises": [
                {"name": "Push-up", "reps": 12, "weightKg": None},
            ]},
            {"date": "2026-11-01", "exercises": [
                {"name": "Push-up", "reps": 15, "weightKg": None},
            ]},
        ]},
    })
    assert response.status_code == 200
    message = response.json()["message"]
    assert "can't make a like-for-like load comparison" in message
    assert "rose by" not in message


def test_conversation_uses_conservative_safety_response_for_pain():
    response = client.post("/coach/conversation", json={"message": "My shoulder hurts during pressing"})
    assert response.status_code == 200
    assert "can't diagnose" in response.json()["message"]
    assert response.json()["responseMode"] == "guided_rules"


def test_conversation_escalates_urgent_symptoms():
    response = client.post("/coach/conversation", json={"message": "I have chest pain while training"})
    assert response.status_code == 200
    assert "emergency medical attention" in response.json()["message"]


def test_conversation_rejects_oversized_messages():
    response = client.post("/coach/conversation", json={"message": "x" * 2001})
    assert response.status_code == 422
