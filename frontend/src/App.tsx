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
type Exercise = { id: string; name: string; muscleGroup: string; equipment?: string | null };
type Routine = { id: string; name: string; exercises: Array<{ exercise: Exercise }> };
type WorkoutSession = {
  id: string;
  startedAt: string;
  routine?: { name: string } | null;
  sets: Array<{ id: string; reps: number; weightKg?: number | null; exercise: Exercise }>;
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
type CoachMessage = { id: string; message: string; explanation: string };

const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("fitloop-token") ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [connections, setConnections] = useState<FriendConnection[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [activeTab, setActiveTab] = useState<"home" | "workouts" | "community">("home");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [registering, setRegistering] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [routineExerciseIds, setRoutineExerciseIds] = useState<string[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState("");
  const [selectedExercise, setSelectedExercise] = useState("");
  const [reps, setReps] = useState("10");
  const [sets, setSets] = useState("3");
  const [weight, setWeight] = useState("");
  const [friendUsername, setFriendUsername] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

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

  async function loadWorkouts() {
    try {
      // Load the library, saved routines and completed sessions together for a responsive workout view.
      const [exerciseData, routineData, sessionData] = await Promise.all([
        request("/api/workouts/exercises"),
        request("/api/workouts/routines"),
        request("/api/workouts/sessions")
      ]);
      setExercises(exerciseData.exercises);
      setRoutines(routineData.routines);
      setSessions(sessionData.sessions);
      if (!selectedExercise && exerciseData.exercises[0]) setSelectedExercise(exerciseData.exercises[0].id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load workouts.");
    }
  }

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

  async function recordWorkout(event: React.FormEvent) {
    event.preventDefault();
    try {
      const count = Math.max(1, Math.min(50, Number(sets)));
      const repetitions = Math.max(1, Math.min(500, Number(reps)));
      const parsedWeight = weight.trim() === "" ? undefined : Number(weight);
      await request("/api/workouts/sessions", {
        method: "POST",
        body: JSON.stringify({
          routineId: selectedRoutine || undefined,
          sets: Array.from({ length: count }, (_, index) => ({
            exerciseId: selectedExercise,
            setNumber: index + 1,
            reps: repetitions,
            weightKg: parsedWeight,
            completed: true
          }))
        })
      });
      setNotice("Workout saved. It has also been shared to your friends-only feed.");
      setWeight("");
      await Promise.all([loadWorkouts(), loadCommunity()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save that workout.");
    }
  }

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

  async function acceptFriendRequest(id: string) {
    try {
      await request(`/api/social/friends/${id}/accept`, { method: "POST", body: JSON.stringify({}) });
      setNotice("Friend request accepted.");
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not accept that request.");
    }
  }

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
      <section className="panel coach-panel">
        <div><p className="eyebrow">YOUR COACH</p><h2>Patterns, not pressure.</h2><p className="muted">Get a short explanation based on the check-ins you've logged.</p></div>
        <button onClick={askCoach}>Review my recent trends</button>
        {coachMessages.map(item => <article className="coach-message" key={item.id}><strong>{item.message}</strong><p className="muted">{item.explanation}</p></article>)}
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
          <p className="eyebrow">SESSION LOGGER</p><h2>Log a workout</h2>
          <label>Routine (optional)<select value={selectedRoutine} onChange={event => setSelectedRoutine(event.target.value)}><option value="">One-off workout</option>{routines.map(routine => <option key={routine.id} value={routine.id}>{routine.name}</option>)}</select></label>
          <label>Exercise<select required value={selectedExercise} onChange={event => setSelectedExercise(event.target.value)}>{exercises.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name} · {exercise.muscleGroup}</option>)}</select></label>
          <label>Sets<input required type="number" min="1" max="50" value={sets} onChange={event => setSets(event.target.value)} /></label>
          <label>Reps per set<input required type="number" min="1" max="500" value={reps} onChange={event => setReps(event.target.value)} /></label>
          <label>Weight in kg (optional)<input type="number" min="0" max="1000" step="0.5" value={weight} onChange={event => setWeight(event.target.value)} placeholder="Leave blank for bodyweight" /></label>
          <button disabled={!selectedExercise}>Save workout</button>
        </form>
      </div>
      <section className="panel section-gap">
        <p className="eyebrow">SAVED ROUTINES</p><h2>Your routines</h2>
        {routines.length === 0 ? <p className="muted">No routines yet. Choose a few exercises above to make your first one.</p> :
          <div className="routine-grid">{routines.map(routine => <article className="routine-card" key={routine.id}><strong>{routine.name}</strong><p className="muted">{routine.exercises.map(item => item.exercise.name).join(" · ")}</p></article>)}</div>}
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
