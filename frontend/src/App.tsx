import { useEffect, useState } from "react";

type User = { id: string; username: string };
type DailyLog = {
  id: string;
  date: string;
  sleepMinutes?: number | null;
  steps?: number | null;
  mood?: number | null;
  focusMinutes?: number | null;
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("fitloop-token") ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [coachMessages, setCoachMessages] = useState<Array<{ id: string; message: string; explanation: string }>>([]);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [registering, setRegistering] = useState(false);

  async function request(path: string, options: RequestInit = {}) {
    // A single request helper keeps authentication headers consistent across private API calls.
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
    return data;
  }

  async function authenticate(event: React.FormEvent) {
    event.preventDefault();
    try {
      const path = registering ? "/api/auth/register" : "/api/auth/login";
      const data = await request(path, {
        method: "POST",
        body: JSON.stringify({ email, password, ...(registering ? { username } : {}) })
      });
      localStorage.setItem("fitloop-token", data.token);
      setToken(data.token);
      setUser(data.user);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  async function loadDashboard() {
    try {
      const data = await request("/api/daily-logs?days=7");
      setLogs(data.logs);
      const history = await request("/api/coach/history");
      setCoachMessages(history.events);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load your dashboard.");
    }
  }

  async function saveCheckIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const optionalNumber = (key: string) => {
      const value = String(form.get(key) ?? "").trim();
      return value === "" ? undefined : Number(value);
    };

    try {
      await request("/api/daily-logs", {
        method: "PUT",
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          sleepMinutes: optionalNumber("sleepHours") === undefined ? undefined : optionalNumber("sleepHours")! * 60,
          steps: optionalNumber("steps"),
          mood: optionalNumber("mood"),
          focusMinutes: optionalNumber("focusMinutes")
        })
      });
      setNotice("Your check-in has been saved.");
      await loadDashboard();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save your check-in.");
    }
  }

  async function askCoach() {
    try {
      const data = await request("/api/coach/check-in", { method: "POST", body: JSON.stringify({}) });
      setCoachMessages(data.messages);
      setNotice("Your check-in summary is ready.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The coach is unavailable.");
    }
  }

  function signOut() {
    // Removing the browser token ends this local session without affecting stored account records.
    localStorage.removeItem("fitloop-token");
    setToken("");
    setUser(null);
    setLogs([]);
    setCoachMessages([]);
  }

  useEffect(() => {
    // A saved token can expire, so a protected request verifies it before showing private records.
    if (token) void loadDashboard();
  }, [token]);

  if (!token) {
    return <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">YOUR ROUTINE, YOUR PACE</p>
        <h1>FitLoop<span>.</span></h1>
        <p className="muted">A calmer way to keep track of the habits that help you feel good.</p>
        <form onSubmit={authenticate}>
          {registering && <label>Username<input required minLength={3} value={username} onChange={event => setUsername(event.target.value)} /></label>}
          <label>Email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>Password<input required type="password" minLength={registering ? 10 : 1} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button>{registering ? "Create account" : "Sign in"}</button>
        </form>
        <button className="text-button" onClick={() => setRegistering(!registering)}>
          {registering ? "Already have an account? Sign in" : "New to FitLoop? Create an account"}
        </button>
        {notice && <p role="alert" className="notice">{notice}</p>}
      </section>
    </main>;
  }

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/">FitLoop<span>.</span></a>
      <div className="account"><span>{user?.username ?? "Your account"}</span><button className="text-button" onClick={signOut}>Sign out</button></div>
    </header>
    <section className="welcome">
      <p className="eyebrow">A LITTLE PROGRESS ADDS UP</p>
      <h1>Your week, at a glance.</h1>
      <p className="muted">Keep it realistic. Pick up where you are.</p>
    </section>
    <section className="stats">
      <article><span>Check-ins this week</span><strong>{logs.length}<small> / 7</small></strong></article>
      <article><span>Latest steps</span><strong>{logs[0]?.steps?.toLocaleString() ?? "—"}</strong></article>
      <article><span>Latest sleep</span><strong>{logs[0]?.sleepMinutes ? `${(logs[0].sleepMinutes / 60).toFixed(1)}h` : "—"}</strong></article>
    </section>
    <section className="content-grid">
      <form className="panel" onSubmit={saveCheckIn}>
        <p className="eyebrow">DAILY CHECK-IN</p><h2>How's today going?</h2>
        <label>Hours of sleep<input name="sleepHours" type="number" min="0" max="24" step="0.5" placeholder="e.g. 7.5" /></label>
        <label>Steps<input name="steps" type="number" min="0" placeholder="e.g. 6500" /></label>
        <label>Mood<select name="mood" defaultValue=""><option value="">Choose a mood</option>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label>
        <label>Focused work or study (minutes)<input name="focusMinutes" type="number" min="0" max="1440" placeholder="e.g. 120" /></label>
        <button>Save check-in</button>
      </form>
      <section className="panel">
        <p className="eyebrow">RECENT ACTIVITY</p><h2>Your last seven days</h2>
        {logs.length === 0 ? <p className="muted">Your check-ins will appear here once you log a day.</p> :
          <ul className="log-list">{logs.map(log => <li key={log.id}>
            <strong>{new Date(log.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</strong>
            <span>{log.steps?.toLocaleString() ?? "No steps"} steps · {log.sleepMinutes ? (log.sleepMinutes / 60).toFixed(1) : "—"}h sleep · Mood {log.mood ?? "—"}/5</span>
          </li>)}</ul>}
      </section>
    </section>
    <section className="panel coach-panel">
      <div><p className="eyebrow">YOUR COACH</p><h2>Patterns, not pressure.</h2><p className="muted">Get a short explanation based on the check-ins you've logged.</p></div>
      <button onClick={askCoach}>Review my recent trends</button>
      {coachMessages.map(item => <article className="coach-message" key={item.id}><strong>{item.message}</strong><p className="muted">{item.explanation}</p></article>)}
    </section>
    {notice && <p role="status" className="notice">{notice}</p>}
    <footer>Small steps count. FitLoop is a habit tracker, not medical advice.</footer>
  </main>;
}
