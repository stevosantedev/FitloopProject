/**
 * Main FitLoop browser application.
 *
 * This component currently coordinates authentication and the three primary
 * areas of the MVP: daily wellbeing, workouts and the friends community. API
 * access is centralised in request() so private calls share the same token and
 * error-handling behaviour.
 */
import { useEffect, useState } from "react";
import MuscleMap from "./components/MuscleMap";
import GuidedRestTimer from "./components/GuidedRestTimer";

type User = { id: string; username: string };
type DailyLog = {
  id: string;
  date: string;
  sleepMinutes?: number | null;
  steps?: number | null;
  mood?: number | null;
  focusMinutes?: number | null;
};
type Exercise = { id: string; name: string; muscleGroup: string; equipment?: string | null; instructions?: string[]; movementPattern?: string | null; muscles?: Array<{ role: "PRIMARY" | "SECONDARY"; muscle: { name: string; slug: string } }> };
type MuscleStat = { id: string; slug: string; name: string; bodyRegion: string; view: string; effectiveSets: number; primarySets: number; secondarySets: number; lastTrainedAt: string | null; recoveryLabel: string };
type WorkoutSetDraft = { reps: string; weight: string; completed: boolean };
type ExerciseDraft = { setEntries: WorkoutSetDraft[]; setType: string; restSeconds: string; rir: string; rpe: string };
type Routine = { id: string; name: string; exercises: Array<{ exercise: Exercise }> };
type WorkoutSession = {
  id: string;
  startedAt: string;
  routine?: { name: string } | null;
  sets: Array<{ id: string; reps: number; weightKg?: number | null; completed: boolean; exercise: Exercise }>;
};
type FriendConnection = {
  id: string;
  status: string;
  requester: User;
  addressee: User;
};
type FeedPost = {
  id: string;
  createdAt: string;
  user: User;
  session?: WorkoutSession | null;
  reactions: Array<{ value: string; userId: string }>;
  comments: Array<{ id: string; text: string; user: { username: string } }>;
};
type CoachMessage = { id: string; message: string; explanation: string; decision?: string };
type CoachPreference = { style: "gentle" | "direct"; focus: "energy" | "consistency" | "recovery" };

// Keep the API origin configurable for deployments while making local development
// work without an extra environment variable.
const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export default function App() {
  // Authentication state is restored from the browser between page reloads.
  // The server remains responsible for validating the token on every private request.
  const [token, setToken] = useState(() => localStorage.getItem("fitloop-token") ?? "");
  // Server records are kept in separate state groups so each tab can refresh
  // only the data it needs without replacing unrelated parts of the dashboard.
  const [user, setUser] = useState<User | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  // Keep the selected coaching tone and focus available while the user edits their preferences.
  const [coachPreference, setCoachPreference] = useState<CoachPreference>({ style: "gentle", focus: "energy" });
  const [exercises, setExercises] = useState<Exercise[]>([]);
  // Local filters keep catalogue searching responsive without repeated API calls.
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exerciseMuscleFilter, setExerciseMuscleFilter] = useState("all");
  const [muscleStats, setMuscleStats] = useState<MuscleStat[]>([]);
  const [selectedMuscle, setSelectedMuscle] = useState("");
  const [anatomyView, setAnatomyView] = useState<"front" | "back">("front");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [connections, setConnections] = useState<FriendConnection[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [activeTab, setActiveTab] = useState<"home" | "workouts" | "community">("home");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [username, setUsername] = useState("");
  const [registering, setRegistering] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [routineExerciseIds, setRoutineExerciseIds] = useState<string[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState("");
  // One live session can contain several exercises and their set sequences.
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  // Per-exercise drafts allow different set counts, rep targets and loads in one session.
  const [exerciseDrafts, setExerciseDrafts] = useState<Record<string, ExerciseDraft>>({});

  // New exercise cards start with three editable rows. Each row remains a
  // separate record so uneven reps, loads and skipped sets survive in history.
  function createDefaultExerciseDraft(): ExerciseDraft {
    return {
      setEntries: Array.from({ length: 3 }, () => ({ reps: "10", weight: "", completed: true })),
      setType: "working", restSeconds: "90", rir: "", rpe: ""
    };
  }
  const [friendUsername, setFriendUsername] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  /**
   * Send a JSON request to the API and attach the current bearer token.
   * Callers receive the parsed response body; non-2xx responses become errors
   * so each form or action can show a useful message in its own context.
   */
  async function request(path: string, options: RequestInit = {}) {
    // One request helper applies the same JSON and authentication rules to every private feature.
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

  // Registration and sign-in share the same form. The mode controls both the
  // endpoint and whether the username field is included in the request body.
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

  // Load the overview data after authentication. These requests are kept together
  // because the dashboard needs the profile, coach settings, check-ins and history.
  async function loadDashboard() {
    try {
      // Restore the profile and coaching preferences when a saved session is reopened in the browser.
      const profile = await request("/api/me");
      setUser(profile.user);
      const preferenceData = await request("/api/coach/preferences");
      setCoachPreference(preferenceData.preference);
      const data = await request("/api/daily-logs?days=7");
      setLogs(data.logs);
      const history = await request("/api/coach/history");
      setCoachMessages(history.events);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load your dashboard.");
    }
  }

  // Refresh all workout data in parallel. The exercise list is also used by the
  // routine builder, so initialise its selection when the user has none yet.
  async function loadWorkouts() {
    try {
      // Load the library, saved routines and completed sessions together for a responsive workout view.
      const [exerciseData, routineData, sessionData, muscleData] = await Promise.all([
        request("/api/workouts/exercises"),
        request("/api/workouts/routines"),
        request("/api/workouts/sessions"),
        request("/api/workouts/muscle-stats?days=30")
      ]);
      setExercises(exerciseData.exercises);
      setRoutines(routineData.routines);
      setSessions(sessionData.sessions);
      setMuscleStats(muscleData.muscles);
      if (selectedExerciseIds.length === 0 && exerciseData.exercises[0]) setSelectedExerciseIds([exerciseData.exercises[0].id]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load workouts.");
    }
  }

  // The API decides which friends and posts are visible; the browser never builds
  // a feed by fetching arbitrary users' activity.
  async function loadCommunity() {
    try {
      // Friends and feed data use the same access-controlled API as the rest of the account.
      const [friendData, feedData] = await Promise.all([
        request("/api/social/friends"),
        request("/api/social/feed")
      ]);
      setConnections(friendData.connections);
      setPosts(feedData.posts);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load your community.");
    }
  }

  // Read the uncontrolled check-in form once, then convert optional fields into
  // numbers. Empty fields are omitted so a user can record only what they know.
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

  // Preferences affect the coach's tone and focus. The API validates the values
  // again before storing them, even though the UI offers a fixed set of choices.
  async function saveCoachPreference(event: React.FormEvent) {
    event.preventDefault();
    try {
      const data = await request("/api/coach/preferences", {
        method: "PUT",
        body: JSON.stringify(coachPreference)
      });
      setCoachPreference(data.preference);
      setNotice("Your coaching preferences have been saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save coaching preferences.");
    }
  }

  // Save feedback against the original coach event so later evaluation can
  // compare suggestions with the user's response.
  async function decideCoachMessage(id: string, decision: "approved" | "declined") {
    try {
      await request("/api/coach/events/" + id + "/decision", {
        method: "PATCH",
        body: JSON.stringify({ decision })
      });
      await loadDashboard();
      setNotice(decision === "approved" ? "Recommendation marked as approved." : "Recommendation marked as declined.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save that decision.");
    }
  }

  // Ask the Python coaching service to review the recent check-ins. The response
  // replaces the visible message list with the latest generated suggestions.
  async function askCoach() {
    try {
      const data = await request("/api/coach/check-in", { method: "POST", body: JSON.stringify({}) });
      setCoachMessages(data.messages);
      setNotice("Your check-in summary is ready.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The coach is unavailable.");
    }
  }

  // Convert the selected exercise IDs into ordered routine entries. The array
  // position becomes sortOrder, preserving the sequence chosen in the builder.
  async function createRoutine(event: React.FormEvent) {
    event.preventDefault();
    try {
      await request("/api/workouts/routines", {
        method: "POST",
        body: JSON.stringify({
          name: routineName,
          exercises: routineExerciseIds.map((exerciseId, sortOrder) => ({ exerciseId, sortOrder }))
        })
      });
      setRoutineName("");
      setRoutineExerciseIds([]);
      setNotice("Your routine has been saved.");
      await loadWorkouts();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save that routine.");
    }
  }

  // Build a separate sequence of set records for each selected exercise.
  // The server still validates every numeric bound before writing the session.
  async function recordWorkout(event: React.FormEvent) {
    event.preventDefault();
    try {
      const workoutSets = selectedExerciseIds.flatMap(exerciseId => {
        const draft = exerciseDrafts[exerciseId] ?? createDefaultExerciseDraft();
        const rest = Number(draft.restSeconds);

        // Validate each row independently because sets can use different rep
        // targets and loads, and an incomplete row must remain distinguishable.
        if (draft.setEntries.length < 1 || draft.setEntries.length > 50 ||
            !Number.isInteger(rest) || rest < 0 || rest > 900 ||
            (draft.rir.trim() !== "" && (!Number.isInteger(Number(draft.rir)) || Number(draft.rir) < 0 || Number(draft.rir) > 10)) ||
            (draft.rpe.trim() !== "" && (!Number.isFinite(Number(draft.rpe)) || Number(draft.rpe) < 1 || Number(draft.rpe) > 10))) {
          throw new Error("Check the set count, rest and effort values for each exercise.");
        }

        // Preserve row order as setNumber. Incomplete rows are saved but excluded
        // from completed-volume calculations by the API.
        return draft.setEntries.map((entry, index) => {
          const repetitions = Number(entry.reps);
          const parsedWeight = entry.weight.trim() === "" ? undefined : Number(entry.weight);
          if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 500 ||
              (parsedWeight !== undefined && (!Number.isFinite(parsedWeight) || parsedWeight < 0 || parsedWeight > 1000))) {
            throw new Error("Check the reps and weight for every set row.");
          }
          return {
            exerciseId, setNumber: index + 1, reps: repetitions,
            weightKg: parsedWeight, completed: entry.completed, setType: draft.setType,
            restSeconds: rest,
            ...(draft.rir.trim() ? { rir: Number(draft.rir) } : {}),
            ...(draft.rpe.trim() ? { rpe: Number(draft.rpe) } : {})
          };
        });
      });
      await request("/api/workouts/sessions", {
        method: "POST",
        body: JSON.stringify({ routineId: selectedRoutine || undefined, sets: workoutSets })
      });
      setNotice("Workout saved. It has also been shared to your friends-only feed.");
      setSelectedExerciseIds([]);
      setExerciseDrafts({});
      await Promise.all([loadWorkouts(), loadCommunity()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save that workout.");
    }
  }

  // Friend requests are addressed by username; the API resolves that name and
  // prevents self-requests or duplicate pending connections.
  async function sendFriendRequest(event: React.FormEvent) {
    event.preventDefault();
    try {
      await request("/api/social/friends/request", {
        method: "POST",
        body: JSON.stringify({ username: friendUsername.trim() })
      });
      setFriendUsername("");
      setNotice("Friend request sent.");
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not send the friend request.");
    }
  }

  // Accept only the request represented by this ID. The API checks that the
  // signed-in account is its intended recipient before changing its status.
  async function acceptFriendRequest(id: string) {
    try {
      await request(`/api/social/friends/${id}/accept`, { method: "POST", body: JSON.stringify({}) });
      setNotice("Friend request accepted.");
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not accept that request.");
    }
  }

  // A reaction is an account-level action on one visible post. Reloading the
  // feed keeps reaction counts and the current user's selection in sync.
  async function reactToPost(id: string, value: string) {
    try {
      await request(`/api/social/posts/${id}/reactions`, {
        method: "POST",
        body: JSON.stringify({ value })
      });
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save your reaction.");
    }
  }

  // Keep a separate draft per post so typing a comment on one card does not
  // overwrite text entered on another card.
  async function commentOnPost(event: React.FormEvent, postId: string) {
    event.preventDefault();
    const text = commentDrafts[postId]?.trim();
    if (!text) return;
    try {
      await request(`/api/social/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text })
      });
      setCommentDrafts(current => ({ ...current, [postId]: "" }));
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not add your comment.");
    }
  }


  // Account removal is intentionally harder to trigger than sign-out: the user
  // must type the confirmation word and the API must verify their password.
  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    if (deleteConfirmation !== "DELETE") {
      setNotice("Type DELETE exactly to confirm account removal.");
      return;
    }
    try {
      await request("/api/auth/account", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation })
      });
      // Clear the local session only after the server confirms that the account was deleted.
      localStorage.removeItem("fitloop-token");
      setToken("");
      setUser(null);
      setDeletePassword("");
      setDeleteConfirmation("");
      setNotice("Your account and linked records have been deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete your account.");
    }
  }

  // Sign-out clears this browser's session and cached private data. It does not
  // call the account-deletion endpoint or remove records from the database.
  function signOut() {
    // Removing the browser token ends this local session without deleting any account records.
    localStorage.removeItem("fitloop-token");
    setToken("");
    setUser(null);
    setLogs([]);
    setCoachMessages([]);
    setExercises([]);
    setRoutines([]);
    setSessions([]);
    setConnections([]);
    setPosts([]);
  }

  useEffect(() => {
    // Each feature loads only when the account is signed in, keeping private requests out of the public screen.
    if (token) void loadDashboard();
  }, [token]);

  useEffect(() => {
    // Switching tabs loads the latest records instead of showing stale cached social or workout information.
    if (token && activeTab === "workouts") void loadWorkouts();
    if (token && activeTab === "community") void loadCommunity();
  }, [token, activeTab]);

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

  // Build small, honest summaries from the records already loaded for this account.
  const chartLogs = [...logs].reverse();
  const maxSteps = Math.max(1, ...chartLogs.map(log => log.steps ?? 0));
  const maxSleep = Math.max(1, ...chartLogs.map(log => log.sleepMinutes ?? 0));
  const maxFocus = Math.max(1, ...chartLogs.map(log => log.focusMinutes ?? 0));
  // Count completed sets by the exercise's primary muscle group. This is a
  // simple training-volume proxy, not a measure of muscle growth or recovery.
  const muscleVolume = sessions.flatMap(session => session.sets)
    .reduce<Record<string, number>>((totals, set) => {
      const group = set.exercise.muscleGroup || "Other";
      totals[group] = (totals[group] ?? 0) + (set.completed ? 1 : 0);
      return totals;
    }, {});
  const muscleEntries = Object.entries(muscleVolume).sort((a, b) => b[1] - a[1]);
  // Derive visible catalogue rows from the current filters rather than storing a
  // second copy of the library that could become stale after a refresh.
  const visibleExercises = exercises.filter(exercise => {
    const term = exerciseSearch.trim().toLowerCase();
    const matchesText = !term || [exercise.name, exercise.muscleGroup, exercise.equipment ?? "", exercise.movementPattern ?? ""].some(value => value.toLowerCase().includes(term));
    const matchesMuscle = exerciseMuscleFilter === "all" || exercise.muscles?.some(link => link.muscle.slug === exerciseMuscleFilter);
    return matchesText && matchesMuscle;
  });
  const selectedMuscleDetail = muscleStats.find(muscle => muscle.slug === selectedMuscle);

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/">FitLoop<span>.</span></a>
      <div className="account"><span>{user?.username ?? "Your account"}</span><button className="text-button" onClick={signOut}>Sign out</button></div>
    </header>
    <nav className="tab-nav" aria-label="Main sections">
      <button className={activeTab === "home" ? "active" : "secondary"} onClick={() => setActiveTab("home")}>Overview</button>
      <button className={activeTab === "workouts" ? "active" : "secondary"} onClick={() => setActiveTab("workouts")}>Workouts</button>
      <button className={activeTab === "community" ? "active" : "secondary"} onClick={() => setActiveTab("community")}>Community</button>
    </nav>

    {activeTab === "home" && <>
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
      <section className="panel section-gap">
        <p className="eyebrow">YOUR RECENT PATTERNS</p><h2>Small signals over seven days</h2>
        <div className="mini-charts">
          <article className="mini-chart"><strong>Sleep</strong><div className="bar-row">{chartLogs.map(log => <div className="bar-column" key={log.id} title={log.sleepMinutes == null ? "No sleep entry" : (log.sleepMinutes / 60).toFixed(1) + " hours"}><span style={{ height: (log.sleepMinutes == null ? 0 : Math.max(4, log.sleepMinutes / maxSleep * 100)) + "%" }} /><small>{new Date(log.date).toLocaleDateString(undefined, { weekday: "short" })}</small></div>)}</div></article>
          <article className="mini-chart"><strong>Steps</strong><div className="bar-row">{chartLogs.map(log => <div className="bar-column" key={log.id} title={log.steps == null ? "No step entry" : log.steps.toLocaleString() + " steps"}><span style={{ height: (log.steps == null ? 0 : Math.max(4, log.steps / maxSteps * 100)) + "%" }} /><small>{new Date(log.date).toLocaleDateString(undefined, { weekday: "short" })}</small></div>)}</div></article>
          <article className="mini-chart"><strong>Mood (out of 5)</strong><div className="bar-row">{chartLogs.map(log => <div className="bar-column" key={log.id} title={log.mood == null ? "No mood entry" : "Mood " + log.mood + " out of 5"}><span style={{ height: (log.mood == null ? 0 : log.mood / 5 * 100) + "%" }} /><small>{new Date(log.date).toLocaleDateString(undefined, { weekday: "short" })}</small></div>)}</div></article>
          <article className="mini-chart"><strong>Focus (minutes)</strong><div className="bar-row">{chartLogs.map(log => <div className="bar-column" key={log.id} title={log.focusMinutes == null ? "No focus entry" : log.focusMinutes + " focused minutes"}><span style={{ height: (log.focusMinutes == null ? 0 : Math.max(4, log.focusMinutes / maxFocus * 100)) + "%" }} /><small>{new Date(log.date).toLocaleDateString(undefined, { weekday: "short" })}</small></div>)}</div></article>
        </div>
        <p className="chart-note">Blank bars mean no entry was logged. These charts describe your records; they do not score your health.</p>
      </section>
      <section className="panel coach-panel">
        <div><p className="eyebrow">YOUR COACH</p><h2>Patterns, not pressure.</h2><p className="muted">Get a short explanation based on the check-ins you've logged.</p></div>
        <button onClick={askCoach}>Review my recent trends</button>
        <form className="coach-preferences" onSubmit={saveCoachPreference}>
          <p className="field-heading">Coaching style</p>
          <select value={coachPreference.style} onChange={event => setCoachPreference(current => ({ ...current, style: event.target.value as CoachPreference["style"] }))}>
            <option value="gentle">Gentle and encouraging</option><option value="direct">Clear and direct</option>
          </select>
          <p className="field-heading">Main focus</p>
          <select value={coachPreference.focus} onChange={event => setCoachPreference(current => ({ ...current, focus: event.target.value as CoachPreference["focus"] }))}>
            <option value="energy">Everyday energy</option><option value="consistency">Consistency</option><option value="recovery">Rest and recovery</option>
          </select>
          <button className="secondary-action">Save coach preferences</button>
        </form>
        {coachMessages.map(item => <article className="coach-message" key={item.id}>
          <strong>{item.message}</strong><p className="muted">{item.explanation}</p>
          <p className="decision-state">Decision: {item.decision ?? "pending"}</p>
          <div className="decision-actions"><button type="button" className="small-button" onClick={() => void decideCoachMessage(item.id, "approved")}>Helpful</button><button type="button" className="small-button" onClick={() => void decideCoachMessage(item.id, "declined")}>Not for me</button></div>
        </article>)}
      </section>
      <section className="panel section-gap account-danger">
        <p className="eyebrow">ACCOUNT CONTROL</p><h2>Delete your account</h2>
        <p className="muted">This permanently removes your account, daily logs, workouts, coach history and social records. This cannot be undone.</p>
        <form onSubmit={deleteAccount}>
          <label>Current password<input required type="password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} /></label>
          <label>Type DELETE to confirm<input required value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} placeholder="DELETE" /></label>
          <button className="danger-button" disabled={deleteConfirmation !== "DELETE" || !deletePassword}>Permanently delete account</button>
        </form>
      </section>
    </>}

    {activeTab === "workouts" && <section className="page-section">
      <div className="welcome compact"><p className="eyebrow">MOVE AT YOUR OWN PACE</p><h1>Your workouts.</h1><p className="muted">Build a routine, log a session and keep a record of what you did.</p></div>
      <div className="content-grid">
        <form className="panel" onSubmit={createRoutine}>
          <p className="eyebrow">ROUTINE BUILDER</p><h2>Create a routine</h2>
          <label>Routine name<input required maxLength={80} value={routineName} onChange={event => setRoutineName(event.target.value)} placeholder="e.g. Full body" /></label>
          <p className="field-heading">Choose exercises</p>
          <div className="exercise-picker">{exercises.map(exercise => <label className="check-row" key={exercise.id}>
            <input type="checkbox" checked={routineExerciseIds.includes(exercise.id)} onChange={event => setRoutineExerciseIds(current => event.target.checked ? [...current, exercise.id] : current.filter(id => id !== exercise.id))} />
            <span>{exercise.name}<small>{exercise.muscleGroup} · {exercise.equipment ?? "Equipment varies"}</small></span>
          </label>)}</div>
          <button disabled={!routineName.trim() || routineExerciseIds.length === 0}>Save routine</button>
        </form>
        <form className="panel" onSubmit={recordWorkout}>
          <p className="eyebrow">WORKOUT BUILDER</p><h2>Build a workout</h2>
          <p className="muted">Choose movements, edit each set and save the session together.</p>
          <label>Routine (optional)<select value={selectedRoutine} onChange={event => {
            const routine = routines.find(item => item.id === event.target.value);
            setSelectedRoutine(event.target.value);
            setSelectedExerciseIds(routine ? routine.exercises.map(item => item.exercise.id) : []);
          }}><option value="">One-off workout</option>{routines.map(routine => <option key={routine.id} value={routine.id}>{routine.name}</option>)}</select></label>
          <label>Search exercises<input value={exerciseSearch} onChange={event => setExerciseSearch(event.target.value)} placeholder="Search name, muscle or movement" /></label>
          <label>Filter by muscle<select value={exerciseMuscleFilter} onChange={event => setExerciseMuscleFilter(event.target.value)}><option value="all">All muscles</option>{muscleStats.map(muscle => <option key={muscle.id} value={muscle.slug}>{muscle.name}</option>)}</select></label>
          <div className="exercise-picker" aria-label="Select exercises for this session">
            {visibleExercises.map(exercise => <label className="check-row" key={exercise.id}>
              <input type="checkbox" checked={selectedExerciseIds.includes(exercise.id)} onChange={event => setSelectedExerciseIds(current => event.target.checked ? [...current, exercise.id] : current.filter(id => id !== exercise.id))} />
              <span>{exercise.name}<small>{exercise.muscleGroup} · {exercise.equipment ?? "Equipment varies"}{exercise.movementPattern ? " · " + exercise.movementPattern : ""}</small></span>
            </label>)}
            {visibleExercises.length === 0 && <p className="muted">No exercises match those filters.</p>}
          </div>
          <p className="field-heading">{selectedExerciseIds.length} exercises selected</p>
          <GuidedRestTimer items={selectedExerciseIds.flatMap(exerciseId => {
            const exercise = exercises.find(item => item.id === exerciseId);
            const draft = exerciseDrafts[exerciseId] ?? createDefaultExerciseDraft();
            return draft.setEntries.flatMap((entry, index) => entry.completed ? [{
              label: exercise?.name ?? "Exercise",
              setNumber: index + 1,
              restSeconds: Number(draft.restSeconds)
            }] : []);
          })} />
          <div className="exercise-session-list">
            {selectedExerciseIds.map(exerciseId => {
              const exercise = exercises.find(item => item.id === exerciseId);
              const draft = exerciseDrafts[exerciseId] ?? createDefaultExerciseDraft();
              const updateDraft = (field: keyof Omit<ExerciseDraft, "setEntries">, value: string) => {
                setExerciseDrafts(current => ({
                  ...current,
                  [exerciseId]: { ...(current[exerciseId] ?? draft), [field]: value }
                }));
              };
              const updateSetEntry = (index: number, field: keyof WorkoutSetDraft, value: string | boolean) => {
                setExerciseDrafts(current => {
                  const currentDraft = current[exerciseId] ?? draft;
                  return {
                    ...current,
                    [exerciseId]: {
                      ...currentDraft,
                      setEntries: currentDraft.setEntries.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, [field]: value } : entry
                      )
                    }
                  };
                });
              };
              if (!exercise) return null;
              return <article className="exercise-session-card" key={exerciseId}>
                <strong>{exercise.name}</strong>
                <div className="set-entry-list">
                  {draft.setEntries.map((entry, index) => <div className="set-entry-row" key={index}>
                    <span className="set-entry-number">Set {index + 1}</span>
                    <label>Reps<input aria-label={exercise.name + ", set " + (index + 1) + ", reps"} required type="number" min="1" max="500" value={entry.reps} onChange={event => updateSetEntry(index, "reps", event.target.value)} /></label>
                    <label>Weight (kg)<input aria-label={exercise.name + ", set " + (index + 1) + ", weight in kilograms"} type="number" min="0" max="1000" step="0.5" value={entry.weight} onChange={event => updateSetEntry(index, "weight", event.target.value)} placeholder="Bodyweight" /></label>
                    <label className="completed-set-control"><input type="checkbox" checked={entry.completed} onChange={event => updateSetEntry(index, "completed", event.target.checked)} /> Completed</label>
                    <button type="button" className="small-button" disabled={draft.setEntries.length === 1} onClick={() => setExerciseDrafts(current => {
                      const currentDraft = current[exerciseId] ?? draft;
                      return { ...current, [exerciseId]: { ...currentDraft, setEntries: currentDraft.setEntries.filter((_, entryIndex) => entryIndex !== index) } };
                    })}>Remove</button>
                  </div>)}
                </div>
                <button type="button" className="small-button add-set-button" disabled={draft.setEntries.length >= 50} onClick={() => setExerciseDrafts(current => {
                  const currentDraft = current[exerciseId] ?? draft;
                  const previous = currentDraft.setEntries[currentDraft.setEntries.length - 1];
                  return { ...current, [exerciseId]: { ...currentDraft, setEntries: [...currentDraft.setEntries, { reps: previous?.reps ?? "10", weight: previous?.weight ?? "", completed: true }] } };
                })}>Add set</button>
                <div className="exercise-draft-fields">
                  <label>Set type<select value={draft.setType} onChange={event => updateDraft("setType", event.target.value)}><option value="working">Working set</option><option value="warmup">Warm-up</option><option value="drop">Drop set</option><option value="failure">To failure</option><option value="rest_pause">Rest-pause</option><option value="amrap">AMRAP</option></select></label>
                  <label>Rest (seconds)<input type="number" min="0" max="900" value={draft.restSeconds} onChange={event => updateDraft("restSeconds", event.target.value)} /></label>
                  <label>Reps in reserve<input type="number" min="0" max="10" value={draft.rir} onChange={event => updateDraft("rir", event.target.value)} placeholder="Optional" /></label>
                  <label>Effort (RPE)<input type="number" min="1" max="10" step="0.5" value={draft.rpe} onChange={event => updateDraft("rpe", event.target.value)} placeholder="Optional" /></label>
                </div>
              </article>;
            })}
          </div>
          <button disabled={selectedExerciseIds.length === 0}>Save complete session</button>
        </form>
      </div>
      <section className="panel section-gap">
        <p className="eyebrow">SAVED ROUTINES</p><h2>Your routines</h2>
        {routines.length === 0 ? <p className="muted">No routines yet. Choose a few exercises above to make your first one.</p> :
          <div className="routine-grid">{routines.map(routine => <article className="routine-card" key={routine.id}><strong>{routine.name}</strong><p className="muted">{routine.exercises.map(item => item.exercise.name).join(" · ")}</p></article>)}</div>}
      </section>
      <section className="panel section-gap">
        <p className="eyebrow">EXERCISE LIBRARY</p><h2>Explore movements</h2>
        <div className="catalogue-grid">{exercises.map(exercise => <article className="catalogue-card" key={exercise.id}>
          <strong>{exercise.name}</strong><span>{exercise.muscleGroup} · {exercise.equipment ?? "Equipment varies"}</span>
          {exercise.movementPattern && <small>{exercise.movementPattern}</small>}
          {exercise.instructions?.length ? <details><summary>Technique notes</summary><ol>{exercise.instructions.map((step, index) => <li key={index}>{step}</li>)}</ol></details> : null}
          {exercise.muscles?.length ? <small>Targets: {exercise.muscles.map(link => link.muscle.name + (link.role === "PRIMARY" ? " (primary)" : "")).join(", ")}</small> : null}
        </article>)}</div>
      </section>
      <section className="panel section-gap">
        <p className="eyebrow">ANATOMY & TRAINING LOAD</p><h2>Muscle map</h2>
        <p className="muted">Choose a muscle to inspect its logged training over the last 30 days. Front and back lists reflect the catalogue's anatomy labels.</p>
        <div className="anatomy-switch"><button type="button" className={anatomyView === "front" ? "active" : "secondary"} onClick={() => setAnatomyView("front")}>Front view</button><button type="button" className={anatomyView === "back" ? "active" : "secondary"} onClick={() => setAnatomyView("back")}>Back view</button></div>
        <div className="anatomy-layout">
          <MuscleMap view={anatomyView} muscles={muscleStats} selectedSlug={selectedMuscle} onSelect={setSelectedMuscle} />
          <aside className="muscle-detail" aria-live="polite">
            {selectedMuscleDetail ? <><strong>{selectedMuscleDetail.name}</strong><p>{selectedMuscleDetail.effectiveSets} weighted sets</p><small>{selectedMuscleDetail.primarySets} primary · {selectedMuscleDetail.secondarySets} secondary</small><p>{selectedMuscleDetail.recoveryLabel}</p><small>Last trained: {selectedMuscleDetail.lastTrainedAt ? new Date(selectedMuscleDetail.lastTrainedAt).toLocaleString() : "No session in this period"}</small></> : <p className="muted">Choose a muscle to inspect its training history.</p>}
          </aside>
        </div>
        <p className="chart-note">Method: a completed set contributes 1.0 for a primary muscle and 0.5 for a secondary muscle. Time-since-training labels are descriptive only and are not a recovery assessment.</p>
      </section>
      <section className="panel section-gap">
        <p className="eyebrow">TRAINING BREAKDOWN</p><h2>Sets by muscle group</h2>
        {muscleEntries.length === 0 ? <p className="muted">Log a workout to see how your completed sets are distributed.</p> :
          <div className="volume-list">{muscleEntries.map(([group, count]) => <div className="volume-row" key={group}><span>{group}</span><div className="volume-track"><span style={{ width: (count / Math.max(...muscleEntries.map(item => item[1])) * 100) + "%" }} /></div><strong>{count}</strong></div>)}</div>}
        <p className="chart-note">This counts completed sets in the sessions currently loaded. It is not a measure of training quality.</p>
      </section>
      <section className="panel section-gap">
        <p className="eyebrow">WORKOUT HISTORY</p><h2>Recent sessions</h2>
        {sessions.length === 0 ? <p className="muted">Completed workouts will show up here.</p> :
          <ul className="log-list">{sessions.map(session => <li key={session.id}><strong>{session.routine?.name ?? "One-off workout"}</strong><span>{new Date(session.startedAt).toLocaleDateString()} · {session.sets.length} sets · {session.sets.map(item => item.exercise.name).filter((name, index, all) => all.indexOf(name) === index).join(", ")}</span></li>)}</ul>}
      </section>
    </section>}

    {activeTab === "community" && <section className="page-section">
      <div className="welcome compact"><p className="eyebrow">BETTER TOGETHER</p><h1>Your community.</h1><p className="muted">Share completed workouts with people you've connected with.</p></div>
      <div className="content-grid">
        <form className="panel" onSubmit={sendFriendRequest}>
          <p className="eyebrow">FIND YOUR PEOPLE</p><h2>Add a friend</h2>
          <label>FitLoop username<input required minLength={3} value={friendUsername} onChange={event => setFriendUsername(event.target.value)} placeholder="Enter their username" /></label>
          <button>Send friend request</button>
        </form>
        <section className="panel">
          <p className="eyebrow">YOUR CONNECTIONS</p><h2>Friends and requests</h2>
          {connections.length === 0 ? <p className="muted">Your accepted friends and incoming requests will appear here.</p> :
            <ul className="log-list">{connections.map(connection => {
              const incoming = connection.addressee.id === user?.id;
              const person = incoming ? connection.requester : connection.addressee;
              return <li key={connection.id}><strong>@{person.username}</strong><span>{connection.status === "accepted" ? "Connected" : incoming ? "Waiting for your reply" : "Request sent"}</span>
                {connection.status === "pending" && incoming && <button className="small-button" onClick={() => void acceptFriendRequest(connection.id)}>Accept request</button>}
              </li>;
            })}</ul>}
        </section>
      </div>
      <section className="panel section-gap">
        <p className="eyebrow">FRIENDS-ONLY FEED</p><h2>Recent activity</h2>
        {posts.length === 0 ? <p className="muted">No shared workouts yet. Once you and your friends log a session, it can appear here.</p> :
          <div className="feed-list">{posts.map(post => <article className="feed-card" key={post.id}>
            <div className="feed-heading"><strong>@{post.user.username}</strong><span>{new Date(post.createdAt).toLocaleString()}</span></div>
            <p>{post.session?.routine?.name ?? "Completed a workout"}</p>
            {post.session && <p className="muted">{post.session.sets.length} sets · {post.session.sets.map(item => item.exercise.name).filter((name, index, all) => all.indexOf(name) === index).join(", ")}</p>}
            <div className="reaction-row"><button className="reaction-button" onClick={() => void reactToPost(post.id, "like")}>👏 {post.reactions.filter(item => item.value === "like").length} Like</button><button className="reaction-button" onClick={() => void reactToPost(post.id, "strong")}>💪 Strong</button><button className="reaction-button" onClick={() => void reactToPost(post.id, "clap")}>🙌 Clap</button></div>
            {post.comments.map(comment => <p className="comment" key={comment.id}><strong>@{comment.user.username}</strong> {comment.text}</p>)}
            <form className="comment-form" onSubmit={event => void commentOnPost(event, post.id)}>
              <input aria-label="Write a comment" value={commentDrafts[post.id] ?? ""} onChange={event => setCommentDrafts(current => ({ ...current, [post.id]: event.target.value }))} placeholder="Write a supportive comment..." maxLength={500} />
              <button disabled={!commentDrafts[post.id]?.trim()}>Send</button>
            </form>
          </article>)}</div>}
      </section>
    </section>}

    {notice && <p role="status" className="notice">{notice}</p>}
    <footer>Small steps count. FitLoop is a habit tracker, not medical advice.</footer>
  </main>;
}
