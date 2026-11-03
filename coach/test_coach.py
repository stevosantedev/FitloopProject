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
