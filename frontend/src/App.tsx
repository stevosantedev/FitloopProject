/**
 * Main FitLoop browser application.
 *
 * This component currently coordinates authentication and the three primary
 * areas of the MVP: daily wellbeing, workouts and the friends community. API
 * access is centralised in request() so private calls share the same token and
 * error-handling behaviour.
 */
import { useEffect, useRef, useState } from "react";
import MuscleMap from "./components/MuscleMap";
import GuidedRestTimer from "./components/GuidedRestTimer";
import CoachRoutineDraft, { type CoachPlanInput, type TrainingPlanView } from "./components/CoachRoutineDraft";
import { clearQueuedWorkouts, getQueuedWorkouts, queueWorkout, removeQueuedWorkout } from "./offlineWorkoutQueue";

type User = { id: string; username: string; displayName?: string | null; bio?: string | null };

class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}
type DailyLog = {
  id: string;
  date: string;
  sleepMinutes?: number | null;
  steps?: number | null;
  mood?: number | null;
  focusMinutes?: number | null;
};
type Exercise = { id: string; name: string; muscleGroup: string; equipment?: string | null; description?: string | null; aliases?: string[]; instructions?: string[]; coachingCues?: string[]; equipmentAlternatives?: string[]; category?: string | null; movementPattern?: string | null; bodyRegion?: string | null; difficulty?: string | null; mediaUrl?: string | null; mediaSource?: string | null; mediaLicense?: string | null; muscles?: Array<{ role: "PRIMARY" | "SECONDARY"; muscle: { name: string; slug: string } }> };
type MuscleStat = { id: string; slug: string; name: string; bodyRegion: string; view: string; effectiveSets: number; primarySets: number; secondarySets: number; lastTrainedAt: string | null; recoveryLabel: string };
type WorkoutSetDraft = { id: string; reps: string; weight: string; completed: boolean };
type ExerciseDraft = { setEntries: WorkoutSetDraft[]; setType: string; restSeconds: string; rir: string; rpe: string };
type Routine = { id: string; name: string; exercises: Array<{ exercise: Exercise }> };
type WorkoutSession = {
  id: string;
  startedAt: string;
  notes?: string | null;
  routine?: { name: string } | null;
  sets: Array<{ id: string; reps: number; weightKg?: number | null; completed: boolean; setType?: string; restSeconds?: number; rir?: number | null; rpe?: number | null; exercise: Exercise }>;
};
type WorkoutFeedSession = {
  id: string;
  startedAt: string;
  routine?: { name: string } | null;
  sets: Array<{ id: string; reps: number; weightKg?: number | null; completed: boolean; exercise: { id: string; name: string } }>;
};
type BlockedAccount = { id: string; username: string; displayName?: string | null };
type ModerationReport = {
  id: string; reason: string; details?: string | null; status: "open" | "reviewing" | "resolved" | "dismissed";
  createdAt: string; reviewedAt?: string | null; resolutionNote?: string | null;
  reporter: User; reportedUser?: User | null;
  post?: { id: string; text?: string | null; user: User } | null;
};
type FriendConnection = {
  id: string;
  status: string;
  requester: User;
  addressee: User;
};
type CommunityProfile = { id: string; username: string; displayName: string | null; bio: string | null };
type FeedPost = {
  id: string;
  createdAt: string;
  text?: string | null;
  type?: string;
  user: User;
  session?: WorkoutFeedSession | null;
  reactions: Array<{ value: string; userId: string }>;
  comments: Array<{ id: string; text: string; user: { id: string; username: string } }>;
  _count?: { comments: number };
};
type WorkoutPostMovement = { exerciseId: string; name: string; completedSets: number; totalSets: number };

function summariseWorkoutPost(session: WorkoutFeedSession): WorkoutPostMovement[] {
  const movements = new Map<string, WorkoutPostMovement>();
  for (const set of session.sets) {
    const movement = movements.get(set.exercise.id) ?? {
      exerciseId: set.exercise.id,
      name: set.exercise.name,
      completedSets: 0,
      totalSets: 0
    };
    movement.totalSets += 1;
    if (set.completed) movement.completedSets += 1;
    movements.set(set.exercise.id, movement);
  }
  return Array.from(movements.values());
}

type CoachMessage = { id: string; message: string; explanation: string; decision?: string };
type CoachConversation = { id: string; title: string; updatedAt: string; messages?: Array<{ id: string; role: string; content: string }>; _count?: { messages: number } };
type CoachChatMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
type CoachPreference = { style: "gentle" | "direct"; focus: "energy" | "consistency" | "recovery" };
type PersonalRecord = { exerciseId: string; exerciseName: string; heaviestLoad: { value: number; date: string | null; sessionId: string | null } | null; mostReps: { value: number; date: string | null; sessionId: string | null } | null; highestSetVolume: { value: number; date: string | null; sessionId: string | null } | null };

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
  const [coachConversations, setCoachConversations] = useState<CoachConversation[]>([]);
  const [activeCoachConversationId, setActiveCoachConversationId] = useState("");
  const [coachChatMessages, setCoachChatMessages] = useState<CoachChatMessage[]>([]);
  const [coachDraft, setCoachDraft] = useState("");
  const [coachChatLoading, setCoachChatLoading] = useState(false);
  const [coachChatSending, setCoachChatSending] = useState(false);
  const [coachChatError, setCoachChatError] = useState("");
  // Keep the selected coaching tone and focus available while the user edits their preferences.
  const [coachPreference, setCoachPreference] = useState<CoachPreference>({ style: "gentle", focus: "energy" });
  const [exercises, setExercises] = useState<Exercise[]>([]);
  // Weekly programmes are separate from one-off routines but reuse their saved day templates.
  const [trainingPlans, setTrainingPlans] = useState<TrainingPlanView[]>([]);
  const [trainingPlansLoading, setTrainingPlansLoading] = useState(false);
  const [trainingPlanSaving, setTrainingPlanSaving] = useState(false);
  // Local filters keep catalogue searching responsive without repeated API calls.
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exerciseMuscleFilter, setExerciseMuscleFilter] = useState("all");
  const [exerciseEquipmentFilter, setExerciseEquipmentFilter] = useState("all");
  const [exercisePatternFilter, setExercisePatternFilter] = useState("all");
  const [exerciseDifficultyFilter, setExerciseDifficultyFilter] = useState("all");
  const [muscleStats, setMuscleStats] = useState<MuscleStat[]>([]);
  const [selectedMuscle, setSelectedMuscle] = useState("");
  const [anatomyView, setAnatomyView] = useState<"front" | "back">("front");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [pendingWorkoutCount, setPendingWorkoutCount] = useState(0);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [connections, setConnections] = useState<FriendConnection[]>([]);
  const [blockedAccounts, setBlockedAccounts] = useState<BlockedAccount[]>([]);
  const [viewedProfile, setViewedProfile] = useState<CommunityProfile | null>(null);
  const [profileViewLoading, setProfileViewLoading] = useState(false);
  const [profileViewError, setProfileViewError] = useState("");
  // Keep focus in the preview and return it to the author link when the dialog closes.
  const profileDialogCloseRef = useRef<HTMLButtonElement | null>(null);
  const profileTriggerRef = useRef<HTMLElement | null>(null);
  // Ignore late profile responses after the dialog closes or a newer profile request starts.
  const profileRequestIdRef = useRef(0);
  // Moderator capability is granted by the API's deployment allowlist, never inferred from profile data.
  const [isModerator, setIsModerator] = useState(false);
  const [moderationReports, setModerationReports] = useState<ModerationReport[]>([]);
  const [moderationStatusFilter, setModerationStatusFilter] = useState<ModerationReport["status"]>("open");
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationError, setModerationError] = useState("");
  const [moderationNoteDrafts, setModerationNoteDrafts] = useState<Record<string, string>>({});
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedLoadMoreError, setFeedLoadMoreError] = useState("");
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedRefreshError, setFeedRefreshError] = useState("");
  const [activeTab, setActiveTab] = useState<"home" | "workouts" | "community" | "coach">("home");
  const [notice, setNotice] = useState("");
  // Keep first-load and refresh failures separate from legitimate empty account data.
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [workoutsLoading, setWorkoutsLoading] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [workoutsError, setWorkoutsError] = useState("");
  const [communityError, setCommunityError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [username, setUsername] = useState("");
  const [registering, setRegistering] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [routineExerciseIds, setRoutineExerciseIds] = useState<string[]>([]);
  const [editingRoutineId, setEditingRoutineId] = useState("");
  const [selectedRoutine, setSelectedRoutine] = useState("");
  // One live session can contain several exercises and their set sequences.
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [exerciseDetailId, setExerciseDetailId] = useState("");
  // Each exercise draft keeps independent set rows and exercise-level effort/rest settings.
  const [exerciseDrafts, setExerciseDrafts] = useState<Record<string, ExerciseDraft>>({});

  // New exercise cards start with three editable rows. Each row remains a
  // separate record so uneven reps, loads and skipped sets survive in history.
  function createDefaultExerciseDraft(exerciseId: string): ExerciseDraft {
    return {
      setEntries: Array.from({ length: 3 }, (_, index) => ({ id: exerciseId + "-set-" + (index + 1), reps: "10", weight: "", completed: false })),
      setType: "working", restSeconds: "90", rir: "", rpe: ""
    };
  }
  const [friendUsername, setFriendUsername] = useState("");
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileBioDraft, setProfileBioDraft] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [communityPostDraft, setCommunityPostDraft] = useState("");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostDraft, setEditingPostDraft] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({});
  const [commentLoadErrors, setCommentLoadErrors] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState("");

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
    if (!response.ok) throw new ApiRequestError(data.error ?? "The request could not be completed.", response.status);
    return data;
  }

  // Fetch only the signed-in account's saved weekly programmes when Coach is opened.
  async function loadTrainingPlans() {
    setTrainingPlansLoading(true);
    try {
      const data = await request("/api/workouts/training-plans");
      setTrainingPlans(data.plans);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load your training programmes.");
    } finally {
      setTrainingPlansLoading(false);
    }
  }

  // Save the reviewed programme in one API operation. Each day becomes a normal
  // owned routine, so existing workout history and set-recording paths still apply.
  async function saveTrainingPlan(input: CoachPlanInput) {
    setTrainingPlanSaving(true);
    try {
      const data = await request("/api/workouts/training-plans", {
        method: "POST",
        body: JSON.stringify(input)
      });
      setTrainingPlans(current => [data.plan, ...current.filter(plan => plan.id !== data.plan.id)]);
      setNotice("Weekly programme saved. Choose a day when you're ready to train.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save your training programme.");
      throw error;
    } finally {
      setTrainingPlanSaving(false);
    }
  }

  async function deleteTrainingPlan(planId: string) {
    if (!window.confirm("Delete this weekly programme? Its workout history will be kept.")) return;
    try {
      await request("/api/workouts/training-plans/" + planId, { method: "DELETE" });
      setTrainingPlans(current => current.filter(plan => plan.id !== planId));
      setNotice("Weekly programme deleted. Completed workout history is unchanged.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete this programme.");
    }
  }

  // Starting a programme day loads its saved routine into the existing workout builder.
  function startTrainingPlanDay(routine: TrainingPlanView["days"][number]["routine"]) {
    setSelectedRoutine(routine.id);
    setSelectedExerciseIds(routine.exercises.map(item => item.exercise.id));
    setActiveTab("workouts");
    setNotice(routine.name + " loaded into the workout builder. Review your sets before starting.");
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
      localStorage.setItem("fitloop-user", JSON.stringify(data.user));
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  // Load the overview data after authentication. These requests are kept together
  // because the dashboard needs the profile, coach settings, check-ins and history.
  async function loadDashboard() {
    setDashboardLoading(true);
    setDashboardError("");
    try {
      // Restore the profile and coaching preferences when a saved session is reopened in the browser.
      const profile = await request("/api/me");
      setUser(profile.user);
      setProfileNameDraft(profile.user.displayName ?? "");
      setProfileBioDraft(profile.user.bio ?? "");
      localStorage.setItem("fitloop-user", JSON.stringify(profile.user));
      const preferenceData = await request("/api/coach/preferences");
      setCoachPreference(preferenceData.preference);
      const data = await request("/api/daily-logs?days=7");
      setLogs(data.logs);
      const history = await request("/api/coach/history");
      setCoachMessages(history.events);
      // Recent sessions belong on the home dashboard as well as the training screen.
      const workoutHistory = await request("/api/workouts/sessions");
      setSessions(workoutHistory.sessions);
    } catch (error) {
      // Keep the signed-in shell available when a previously authenticated user reopens FitLoop offline.
      if (!navigator.onLine) {
        const cachedUser = localStorage.getItem("fitloop-user");
        if (cachedUser) {
          try { setUser(JSON.parse(cachedUser) as User); } catch { localStorage.removeItem("fitloop-user"); }
        }
        const message = "You are offline. Cached overview data may be incomplete until you reconnect.";
        setDashboardError(message);
        setNotice("You are offline. You can record a workout and it will sync when connected.");
      } else {
        const message = error instanceof Error ? error.message : "Could not load your dashboard.";
        setDashboardError(message);
        setNotice(message);
      }
    } finally {
      setDashboardLoading(false);
    }
  }

  // Refresh all workout data in parallel. The exercise list is also used by the
  // routine builder, so initialise its selection when the user has none yet.
  async function loadWorkouts() {
    setWorkoutsLoading(true);
    setWorkoutsError("");
    try {
      // Load the library, saved routines and completed sessions together for a responsive workout view.
      const [exerciseData, routineData, sessionData, muscleData, recordData] = await Promise.all([
        request("/api/workouts/exercises"),
        request("/api/workouts/routines"),
        request("/api/workouts/sessions"),
        request("/api/workouts/muscle-stats?days=30"),
        request("/api/workouts/personal-records")
      ]);
      setExercises(exerciseData.exercises);
      // The public exercise catalogue is safe to keep locally for offline workout building.
      if (user?.id) localStorage.setItem(`fitloop-exercise-catalogue:${user.id}`, JSON.stringify(exerciseData.exercises));
      setRoutines(routineData.routines);
      setSessions(sessionData.sessions);
      setMuscleStats(muscleData.muscles);
      setPersonalRecords(recordData.records);
    } catch (error) {
      if (!navigator.onLine) {
        const cachedCatalogue = user?.id ? localStorage.getItem(`fitloop-exercise-catalogue:${user.id}`) : null;
        if (cachedCatalogue) {
          try {
            setExercises(JSON.parse(cachedCatalogue) as Exercise[]);
            const message = "You are offline. Your saved exercise library is available; routines and training history will refresh when you reconnect.";
            setWorkoutsError(message);
            setNotice(message);
          } catch {
            if (user?.id) localStorage.removeItem(`fitloop-exercise-catalogue:${user.id}`);
            const message = "The offline exercise library could not be read. Reconnect to reload it.";
            setWorkoutsError(message);
            setNotice(message);
          }
        } else {
          const message = "Connect once to make the exercise library available offline.";
          setWorkoutsError(message);
          setNotice(message);
        }
      } else {
        const message = error instanceof Error ? error.message : "Could not load workouts.";
        setWorkoutsError(message);
        setNotice(message);
      }
    } finally {
      setWorkoutsLoading(false);
    }
  }

  // The API decides which friends and posts are visible; the browser never builds
  // a feed by fetching arbitrary users' activity.
  async function loadCommunity() {
    setCommunityLoading(true);
    setCommunityError("");
    try {
      // Friends and feed data use the same access-controlled API as the rest of the account.
      const [friendData, feedData, blockData] = await Promise.all([
        request("/api/social/friends"),
        request("/api/social/feed"),
        request("/api/social/blocks")
      ]);
      setConnections(friendData.connections);
      setPosts(feedData.posts);
      setFeedCursor(feedData.nextCursor ?? null);
      setFeedHasMore(Boolean(feedData.hasMore));
      setBlockedAccounts(blockData.blocks.map((item: any) => item.blockedUser));
      // A moderator-only request is made only after the server confirms this account's capability.
      try {
        const capability = await request("/api/social/moderation/capability");
        setIsModerator(Boolean(capability.isModerator));
        if (capability.isModerator) await loadModerationReports("open");
        else setModerationReports([]);
      } catch (error) {
        setIsModerator(false);
        setModerationError(error instanceof Error ? error.message : "Moderator tools are unavailable.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load your community.";
      setCommunityError(message);
      setNotice(message);
    } finally {
      setCommunityLoading(false);
    }
  }


  // Profile details are requested only when someone opens a profile. The API
  // decides whether that profile is visible under its privacy and block rules.
  function closeCommunityProfile() {
    // Invalidate an outstanding request so a late response cannot reopen a dismissed private preview.
    profileRequestIdRef.current += 1;
    setViewedProfile(null);
    setProfileViewError("");
    setProfileViewLoading(false);
  }

  async function openCommunityProfile(userId: string) {
    const requestId = ++profileRequestIdRef.current;
    setViewedProfile(null);
    setProfileViewError("");
    setProfileViewLoading(true);
    try {
      const data = await request("/api/social/profile/" + encodeURIComponent(userId));
      if (requestId === profileRequestIdRef.current) setViewedProfile(data.profile);
    } catch (error) {
      if (requestId === profileRequestIdRef.current) {
        setProfileViewError(error instanceof Error ? error.message : "This profile is unavailable.");
      }
    } finally {
      if (requestId === profileRequestIdRef.current) setProfileViewLoading(false);
    }
  }

  // Moderator queue data is fetched only after the API confirms this account is allowlisted.
  async function loadModerationReports(status = moderationStatusFilter) {
    setModerationLoading(true);
    setModerationError("");
    try {
      const data = await request("/api/social/moderation/reports?status=" + encodeURIComponent(status));
      setModerationReports(data.reports);
    } catch (error) {
      setModerationError(error instanceof Error ? error.message : "Could not load moderation reports.");
    } finally { setModerationLoading(false); }
  }

  // Every decision is checked again by the API; terminal decisions include a short explanation for the record.
  async function reviewCommunityReport(reportId: string, status: ModerationReport["status"]) {
    const resolutionNote = moderationNoteDrafts[reportId]?.trim();
    if (["resolved", "dismissed"].includes(status) && (!resolutionNote || resolutionNote.length < 10)) return;
    try {
      await request("/api/social/moderation/reports/" + reportId, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(resolutionNote ? { resolutionNote } : {}) })
      });
      setModerationNoteDrafts(current => ({ ...current, [reportId]: "" }));
      setNotice(status === "resolved" ? "Report marked as resolved." : status === "dismissed" ? "Report dismissed." : "Report status updated.");
      await loadModerationReports();
    } catch (error) {
      setModerationError(error instanceof Error ? error.message : "Could not update this report.");
    }
  }

  // Append older posts without replacing the current feed. The API applies
  // the same live friendship and block checks to every cursor request.
  // Refresh only the first feed page so a transient failure never discards activity already on screen.
  async function refreshCommunityFeed() {
    if (feedRefreshing || feedLoadingMore) return;
    setFeedRefreshing(true);
    setFeedRefreshError("");
    try {
      const data = await request("/api/social/feed");
      setPosts(data.posts);
      setFeedCursor(data.nextCursor ?? null);
      setFeedHasMore(Boolean(data.hasMore));
      setFeedLoadMoreError("");
    } catch (error) {
      setFeedRefreshError(error instanceof Error ? error.message : "Could not refresh the community feed.");
    } finally {
      setFeedRefreshing(false);
    }
  }

  async function loadMoreCommunityPosts() {
    if (!feedHasMore || !feedCursor || feedLoadingMore || feedRefreshing) return;
    setFeedLoadingMore(true);
    setFeedLoadMoreError("");
    try {
      const data = await request("/api/social/feed?cursor=" + encodeURIComponent(feedCursor));
      setPosts(current => {
        const existing = new Set(current.map(post => post.id));
        return [...current, ...data.posts.filter((post: FeedPost) => !existing.has(post.id))];
      });
      setFeedCursor(data.nextCursor ?? null);
      setFeedHasMore(Boolean(data.hasMore));
    } catch (error) {
      setFeedLoadMoreError(error instanceof Error ? error.message : "Could not load older community posts.");
    } finally {
      setFeedLoadingMore(false);
    }
  }

  // Load the next chronological comment page without replacing comments already on the card.
  // The API rechecks the post's current friends/block visibility before returning any rows.
  async function loadMoreComments(postId: string) {
    const post = posts.find(item => item.id === postId);
    const cursor = post?.comments[post.comments.length - 1]?.id;
    if (!post || !cursor || commentLoading[postId] || post.comments.length >= (post._count?.comments ?? post.comments.length)) return;
    setCommentLoading(current => ({ ...current, [postId]: true }));
    setCommentLoadErrors(current => ({ ...current, [postId]: "" }));
    try {
      const data = await request(`/api/social/posts/${postId}/comments?cursor=${encodeURIComponent(cursor)}`);
      setPosts(current => current.map(item => {
        if (item.id !== postId) return item;
        const existing = new Set(item.comments.map(comment => comment.id));
        return { ...item, comments: [...item.comments, ...data.comments.filter((comment: FeedPost["comments"][number]) => !existing.has(comment.id))] };
      }));
    } catch (error) {
      setCommentLoadErrors(current => ({ ...current, [postId]: error instanceof Error ? error.message : "Could not load older comments." }));
    } finally {
      setCommentLoading(current => ({ ...current, [postId]: false }));
    }
  }

  // Conversation history is private and loaded only after the coach destination is opened.
  async function loadCoachConversations() {
    setCoachChatLoading(true);
    setCoachChatError("");
    try {
      const data = await request("/api/coach/conversations");
      setCoachConversations(data.conversations);
      if (!activeCoachConversationId && data.conversations[0]) setActiveCoachConversationId(data.conversations[0].id);
    } catch (error) {
      setCoachChatError(error instanceof Error ? error.message : "Could not load coach conversations.");
    } finally { setCoachChatLoading(false); }
  }

  async function loadCoachChat(conversationId: string) {
    setCoachChatLoading(true);
    setCoachChatError("");
    try {
      const data = await request("/api/coach/conversations/" + conversationId + "/messages");
      setCoachChatMessages(data.messages);
    } catch (error) {
      setCoachChatError(error instanceof Error ? error.message : "Could not load this conversation.");
    } finally { setCoachChatLoading(false); }
  }

  async function createCoachConversation() {
    try {
      const data = await request("/api/coach/conversations", { method: "POST", body: JSON.stringify({}) });
      setCoachConversations(current => [data.conversation, ...current]);
      setActiveCoachConversationId(data.conversation.id);
      setCoachChatMessages([]);
      setCoachChatError("");
    } catch (error) {
      setCoachChatError(error instanceof Error ? error.message : "Could not start a conversation.");
    }
  }

  async function sendCoachMessage(event: React.FormEvent) {
    event.preventDefault();
    const message = coachDraft.trim();
    if (!message || coachChatSending) return;
    setCoachChatSending(true);
    setCoachChatError("");
    try {
      let conversationId = activeCoachConversationId;
      if (!conversationId) {
        const created = await request("/api/coach/conversations", { method: "POST", body: JSON.stringify({}) });
        conversationId = created.conversation.id;
      }
      const data = await request("/api/coach/conversations/" + conversationId + "/messages", {
        method: "POST", body: JSON.stringify({ message })
      });
      setActiveCoachConversationId(conversationId);
      setCoachChatMessages(current => [...current, ...data.messages]);
      setCoachDraft("");
      await loadCoachConversations();
    } catch (error) {
      setCoachChatError(error instanceof Error ? error.message : "The coach could not send a reply.");
    } finally { setCoachChatSending(false); }
  }

  function reviewCoachRoutineDraft(name: string, exerciseIds: string[]) {
    setRoutineName(name);
    setRoutineExerciseIds(exerciseIds);
    setEditingRoutineId("");
    setActiveTab("workouts");
    setNotice("Coach draft loaded into the routine editor. Review the movements and save when ready; nothing has been saved yet.");
  }

  async function deleteCoachConversation(conversationId: string) {
    if (!window.confirm("Delete this coach conversation? Its messages will also be deleted.")) return;
    try {
      await request("/api/coach/conversations/" + conversationId, { method: "DELETE" });
      const remaining = coachConversations.filter(item => item.id !== conversationId);
      setCoachConversations(remaining);
      if (activeCoachConversationId === conversationId) {
        setActiveCoachConversationId(remaining[0]?.id ?? "");
        setCoachChatMessages([]);
      }
      setNotice("Coach conversation deleted.");
    } catch (error) {
      setCoachChatError(error instanceof Error ? error.message : "Could not delete this conversation.");
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

  // Save the ordered movement list as either a new template or an update.
  // The API rechecks ownership and exercise access before replacing any links.
  async function createRoutine(event: React.FormEvent) {
    event.preventDefault();
    try {
      await request(editingRoutineId ? "/api/workouts/routines/" + editingRoutineId : "/api/workouts/routines", {
        method: editingRoutineId ? "PUT" : "POST",
        body: JSON.stringify({
          name: routineName,
          exercises: routineExerciseIds.map((exerciseId, sortOrder) => ({ exerciseId, sortOrder }))
        })
      });
      setRoutineName("");
      setRoutineExerciseIds([]);
      setEditingRoutineId("");
      setNotice(editingRoutineId ? "Your routine has been updated." : "Your routine has been saved.");
      await loadWorkouts();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save that routine.");
    }
  }

  // Load an existing template into the same editor used to create one.
  function editRoutine(routine: Routine) {
    setEditingRoutineId(routine.id);
    setRoutineName(routine.name);
    setRoutineExerciseIds(routine.exercises.map(item => item.exercise.id));
    setNotice("Editing " + routine.name + ". Save changes when you're ready.");
  }

  // Removing a template never removes completed sessions that used it.
  async function deleteRoutine(routine: Routine) {
    if (!window.confirm("Delete the routine “" + routine.name + "”? Your workout history will be kept.")) return;
    try {
      await request("/api/workouts/routines/" + routine.id, { method: "DELETE" });
      if (selectedRoutine === routine.id) setSelectedRoutine("");
      if (editingRoutineId === routine.id) {
        setEditingRoutineId("");
        setRoutineName("");
        setRoutineExerciseIds([]);
      }
      setNotice("Routine deleted. Your workout history is unchanged.");
      await loadWorkouts();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete that routine.");
    }
  }

  // Build a separate sequence of set records for each selected exercise.
  // The server still validates every numeric bound before writing the session.
  async function recordWorkout(event: React.FormEvent) {
    event.preventDefault();
    try {
      const workoutSets = selectedExerciseIds.flatMap(exerciseId => {
        const draft = exerciseDrafts[exerciseId] ?? createDefaultExerciseDraft(exerciseId);
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
      // An abandoned draft may contain incomplete rows, but a saved workout
      // must include at least one set the user actually performed.
      if (!workoutSets.some(set => set.completed)) {
        throw new Error("Complete at least one set before saving this workout.");
      }
      if (!user) throw new Error("Sign in again before saving this workout.");
      const payload = { routineId: selectedRoutine || undefined, sets: workoutSets };
      const requestId = crypto.randomUUID();

      // Persist before attempting the network request. If the connection drops
      // after the server commits, the same identifier makes the retry idempotent.
      await queueWorkout(user.id, payload, requestId);
      const queued = await getQueuedWorkouts(user.id);
      setPendingWorkoutCount(queued.length);

      if (!navigator.onLine) {
        setNotice("Workout saved on this device. It will sync when you're back online.");
      } else {
        try {
          await request("/api/workouts/sessions", {
            method: "POST",
            body: JSON.stringify({ ...payload, clientRequestId: requestId })
          });
          await removeQueuedWorkout(requestId);
          setPendingWorkoutCount((count) => Math.max(0, count - 1));
          setNotice("Workout saved. It has also been shared to your friends-only feed.");
          await Promise.all([loadWorkouts(), loadCommunity()]);
        } catch (syncError) {
          // Keep network failures and expired sessions queued. A definite
          // validation/authentication response is surfaced rather than silently discarded.
          if (syncError instanceof ApiRequestError && syncError.status >= 400 && syncError.status < 500 && syncError.status !== 401) {
            await removeQueuedWorkout(requestId);
            setPendingWorkoutCount((count) => Math.max(0, count - 1));
            throw syncError;
          }
          setNotice("Workout saved on this device. FitLoop will retry syncing it when the connection is available.");
        }
      }

      setSelectedExerciseIds([]);
      setExerciseDrafts({});
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save that workout.");
    }
  }

  // Keep the profile intentionally small: a display name and short bio are enough to give feed posts a human identity.
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileSaving(true);
    try {
      const data = await request("/api/social/profile/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: profileNameDraft.trim() || null,
          bio: profileBioDraft.trim() || null
        })
      });
      setUser(current => current ? { ...current, ...data.profile } : current);
      localStorage.setItem("fitloop-user", JSON.stringify({ ...user, ...data.profile }));
      setNotice("Your profile has been updated.");
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update your profile.");
    } finally { setProfileSaving(false); }
  }

  // Text updates are shared only to the existing friends-only audience.
  async function createCommunityPost(event: React.FormEvent) {
    event.preventDefault();
    const text = communityPostDraft.trim();
    if (!text) return;
    try {
      await request("/api/social/posts", { method: "POST", body: JSON.stringify({ text }) });
      setCommunityPostDraft("");
      setNotice("Your update has been shared with your accepted friends.");
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not share your update.");
    }
  }

  function startPostEdit(post: FeedPost) {
    setEditingPostId(post.id);
    setEditingPostDraft(post.text ?? "");
  }

  function cancelPostEdit() {
    setEditingPostId(null);
    setEditingPostDraft("");
  }

  async function savePostEdit(event: React.FormEvent, postId: string) {
    event.preventDefault();
    const text = editingPostDraft.trim();
    if (!text) return;
    try {
      await request("/api/social/posts/" + postId, { method: "PATCH", body: JSON.stringify({ text }) });
      cancelPostEdit();
      await loadCommunity();
      setNotice("Your update has been edited.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not edit your update.");
    }
  }

  async function deleteCommunityPost(postId: string) {
    if (!window.confirm("Delete this post and its comments and reactions?")) return;
    try {
      await request("/api/social/posts/" + postId, { method: "DELETE" });
      setNotice("Your post has been deleted.");
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete your post.");
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

  // Each relationship action has a matching server-side ownership and status check.
  async function manageFriendRequest(id: string, action: "decline" | "cancel") {
    try {
      await request(`/api/social/friends/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
      setNotice(action === "decline" ? "Friend request declined." : "Friend request cancelled.");
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update that friend request.");
    }
  }

  async function removeFriend(id: string) {
    if (!window.confirm("Remove this friend? You will no longer see each other's friends-only activity.")) return;
    try {
      await request(`/api/social/friends/${id}`, { method: "DELETE" });
      setNotice("Friend removed.");
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove this friend.");
    }
  }

  async function reportCommunityTarget(targetType: "user" | "post", targetId: string) {
    try {
      await request("/api/social/reports", { method: "POST", body: JSON.stringify({ targetType, targetId, reason: "other" }) });
      setNotice("Report submitted privately. Thank you for helping keep the community safe.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit your report.");
    }
  }

  async function blockCommunityUser(userId: string) {
    if (!window.confirm("Block this account? Their profile and activity will be hidden from you, your connection will be removed, and they will not be able to send you a new friend request.")) return;
    try {
      await request("/api/social/blocks/" + userId, { method: "POST", body: JSON.stringify({}) });
      setNotice("Account blocked. Their activity and connection have been hidden.");
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not block this account.");
    }
  }

  async function unblockCommunityUser(userId: string) {
    try {
      await request("/api/social/blocks/" + userId, { method: "DELETE" });
      setNotice("Account unblocked. You can connect again if both accounts allow it.");
      await loadCommunity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not unblock this account.");
    }
  }

  // The API toggles the selected value off or switches this account to a
  // different value; reloading keeps every count and selected state canonical.
  async function reactToPost(id: string, value: string) {
    try {
      const result = await request(`/api/social/posts/${id}/reactions`, {
        method: "POST",
        body: JSON.stringify({ value })
      });
      await loadCommunity();
      setNotice(result.removed ? "Reaction removed." : "Reaction saved.");
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


  // Editing and deleting comments are author-only actions enforced again by the API.
  async function saveCommentEdit(commentId: string) {
    const text = editingCommentDraft.trim();
    if (!text) return;
    try {
      await request("/api/social/comments/" + commentId, { method: "PATCH", body: JSON.stringify({ text }) });
      setEditingCommentId(null);
      setEditingCommentDraft("");
      await loadCommunity();
      setNotice("Your comment has been updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update your comment.");
    }
  }

  async function deleteComment(commentId: string) {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await request("/api/social/comments/" + commentId, { method: "DELETE" });
      await loadCommunity();
      setNotice("Your comment has been deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete your comment.");
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
      const deletedUserId = user?.id;
      await request("/api/auth/account", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation })
      });
      // Clear this account's offline queue and catalogue only after server-side deletion succeeds.
      let localDataCleared = true;
      if (deletedUserId) {
        try {
          await clearQueuedWorkouts(deletedUserId);
        } catch (cleanupError) {
          localDataCleared = false;
          console.error("Could not clear deleted account offline queue.", cleanupError);
        }
        localStorage.removeItem("fitloop-exercise-catalogue:" + deletedUserId);
      }
      localStorage.removeItem("fitloop-token");
      localStorage.removeItem("fitloop-user");
      setToken("");
      setUser(null);
      setCoachConversations([]);
      setActiveCoachConversationId("");
      setCoachChatMessages([]);
      setCoachDraft("");
      setDeletePassword("");
      setDeleteConfirmation("");
      setNotice(localDataCleared
        ? "Your account and linked records have been deleted."
        : "Your account has been deleted, but this browser could not clear its saved offline workouts. Clear this site's storage to remove the remaining local copy.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete your account.");
    }
  }

  // Sign-out clears the active view and token but preserves queued workouts for
  // this account, allowing them to sync after the user signs in again.
  function signOut() {
    // Removing the browser token ends this local session without deleting account records or offline drafts.
    localStorage.removeItem("fitloop-token");
    localStorage.removeItem("fitloop-user");
    setToken("");
    setUser(null);
    setLogs([]);
    setCoachMessages([]);
    setCoachConversations([]);
    setActiveCoachConversationId("");
    setCoachChatMessages([]);
    setCoachDraft("");
    setExercises([]);
    setRoutines([]);
    setSessions([]);
    setConnections([]);
    setPosts([]);
    // Do not retain privileged UI or report data when another account signs in on this browser.
    setIsModerator(false);
    setModerationReports([]);
    setModerationError("");
    setModerationNoteDrafts({});
  }

  useEffect(() => {
    const isOpen = profileViewLoading || Boolean(profileViewError) || Boolean(viewedProfile);
    if (!isOpen) return;
    profileDialogCloseRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCommunityProfile();
      } else if (event.key === "Tab") {
        // The preview currently has one action. Keep forward and reverse tab navigation inside the modal.
        event.preventDefault();
        profileDialogCloseRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      profileTriggerRef.current?.focus();
    };
  }, [profileViewLoading, profileViewError, viewedProfile]);

  useEffect(() => {
    // Each feature loads only when the account is signed in, keeping private requests out of the public screen.
    if (token) void loadDashboard();
  }, [token]);

  useEffect(() => {
    // The Coach routine builder uses the same exercise catalogue as Workouts, so load it on either tab.
    if (token && (activeTab === "workouts" || activeTab === "coach")) void loadWorkouts();
    // Switching tabs loads the latest social and coaching records instead of showing stale data.
    if (token && activeTab === "community") void loadCommunity();
    if (token && activeTab === "coach") {
      void loadCoachConversations();
      void loadTrainingPlans();
    }
  }, [token, activeTab]);

  useEffect(() => {
    if (token && activeTab === "coach" && activeCoachConversationId) void loadCoachChat(activeCoachConversationId);
  }, [token, activeTab, activeCoachConversationId]);

  useEffect(() => {
    // A queued session belongs to one account. It is never sent with a different
    // user's token, and the queue stores no bearer credentials of its own.
    if (!token || !user) {
      setPendingWorkoutCount(0);
      return;
    }

    let syncing = false;
    const syncQueuedWorkouts = async () => {
      if (syncing) return;
      syncing = true;
      try {
        const queued = await getQueuedWorkouts(user.id);
        setPendingWorkoutCount(queued.length);
        if (!navigator.onLine) return;
        let hadPermanentFailure = false;
        for (const entry of queued) {
          try {
            await request("/api/workouts/sessions", {
              method: "POST",
              body: JSON.stringify({ ...entry.payload, clientRequestId: entry.id })
            });
            await removeQueuedWorkout(entry.id);
            setPendingWorkoutCount((count) => Math.max(0, count - 1));
          } catch (error) {
            // A validation response will not improve on a network retry. Remove only
            // permanently invalid payloads so one bad item cannot block later sessions.
            if (error instanceof ApiRequestError && [400, 404, 422].includes(error.status)) {
              hadPermanentFailure = true;
              await removeQueuedWorkout(entry.id);
              setPendingWorkoutCount((count) => Math.max(0, count - 1));
              setNotice("One saved workout could not be synced because its details are no longer valid. Record it again to save it.");
              continue;
            }

            // Authentication failures remain queued for the same account to retry
            // after sign-in; transient server/network failures also stay in order.
            setNotice(error instanceof ApiRequestError && error.status === 401
              ? "A saved workout is waiting for you to sign in again before it can sync."
              : error instanceof Error
                ? `A saved workout is waiting to sync: ${error.message}`
                : "A saved workout is waiting for a connection.");
            break;
          }
        }
        const remaining = await getQueuedWorkouts(user.id);
        setPendingWorkoutCount(remaining.length);
        if (remaining.length === 0 && queued.length > 0 && !hadPermanentFailure) {
          setNotice("Your saved offline workouts have synced.");
          await Promise.all([loadWorkouts(), loadCommunity()]);
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not check the offline workout queue.");
      } finally {
        syncing = false;
      }
    };

    window.addEventListener("online", syncQueuedWorkouts);
    void syncQueuedWorkouts();
    return () => window.removeEventListener("online", syncQueuedWorkouts);
  }, [token, user?.id]);

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
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const sessionsThisWeek = sessions.filter(session => new Date(session.startedAt).getTime() >= sevenDaysAgo);
  const completedSetsThisWeek = sessionsThisWeek.flatMap(session => session.sets).filter(set => set.completed).length;
  // Count completed sets by the exercise's primary muscle group. This is a
  // simple training-volume proxy, not a measure of muscle growth or recovery.
  const muscleVolume = sessions.flatMap(session => session.sets)
    .reduce<Record<string, number>>((totals, set) => {
      const group = set.exercise.muscleGroup || "Other";
      totals[group] = (totals[group] ?? 0) + (set.completed ? 1 : 0);
      return totals;
    }, {});
  const muscleEntries = Object.entries(muscleVolume).sort((a, b) => b[1] - a[1]);
  // Compare the latest logged performance for each movement with its previous appearance.
  const exerciseProgress = Object.values(sessions.flatMap(session => {
    const grouped = new Map<string, typeof session.sets>();
    session.sets.filter(set => set.completed).forEach(set => {
      grouped.set(set.exercise.id, [...(grouped.get(set.exercise.id) ?? []), set]);
    });
    return [...grouped.entries()].map(([exerciseId, sets]) => ({
      exerciseId, name: sets[0].exercise.name, date: session.startedAt, sets
    }));
  }).reduce<Record<string, Array<{ exerciseId: string; name: string; date: string; sets: WorkoutSession["sets"] }>>>((groups, item) => {
    (groups[item.exerciseId] ??= []).push(item);
    return groups;
  }, {})).map(entries => {
    const ordered = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = ordered[0], previous = ordered[1];
    const topLoad = (sets: WorkoutSession["sets"]) => Math.max(0, ...sets.map(set => set.weightKg ?? 0));
    const latestLoad = topLoad(latest.sets), previousLoad = previous ? topLoad(previous.sets) : 0;
    return {
      exerciseId: latest.exerciseId, name: latest.name, date: latest.date, sessions: ordered.length,
      completedSets: latest.sets.length, bestLoad: latestLoad,
      loadChange: previous && latestLoad > 0 && previousLoad > 0 ? latestLoad - previousLoad : null,
      latestVolume: latest.sets.reduce((sum, set) => sum + set.reps * (set.weightKg ?? 0), 0),
      // Keep a short recent timeline so the dashboard can show a real trend,
      // rather than implying that two sessions establish a long-term pattern.
      history: ordered.slice(0, 6).reverse().map(entry => ({
        date: entry.date,
        topLoad: topLoad(entry.sets),
        completedSets: entry.sets.length,
        volume: entry.sets.reduce((sum, set) => sum + set.reps * (set.weightKg ?? 0), 0)
      }))
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);

  // Derive visible catalogue rows from the current filters rather than storing a
  // second copy of the library that could become stale after a refresh.
  const visibleExercises = exercises.filter(exercise => {
    const term = exerciseSearch.trim().toLowerCase();
    const searchable = [exercise.name, exercise.muscleGroup, exercise.equipment ?? "", exercise.movementPattern ?? "", exercise.description ?? "", ...(exercise.aliases ?? []), ...(exercise.instructions ?? []), ...(exercise.coachingCues ?? []), ...(exercise.equipmentAlternatives ?? [])];
    const matchesText = !term || searchable.some(value => value.toLowerCase().includes(term));
    const matchesMuscle = exerciseMuscleFilter === "all" || exercise.muscles?.some(link => link.muscle.slug === exerciseMuscleFilter);
    const matchesEquipment = exerciseEquipmentFilter === "all" || (exercise.equipment ?? "Other") === exerciseEquipmentFilter;
    const matchesPattern = exercisePatternFilter === "all" || (exercise.movementPattern ?? "Other") === exercisePatternFilter;
    const matchesDifficulty = exerciseDifficultyFilter === "all" || (exercise.difficulty ?? "Unspecified") === exerciseDifficultyFilter;
    return matchesText && matchesMuscle && matchesEquipment && matchesPattern && matchesDifficulty;
  });
  const hasActiveExerciseFilters = Boolean(exerciseSearch.trim()) || exerciseMuscleFilter !== "all" || exerciseEquipmentFilter !== "all" || exercisePatternFilter !== "all" || exerciseDifficultyFilter !== "all";
  const clearExerciseFilters = () => {
    setExerciseSearch("");
    setExerciseMuscleFilter("all");
    setExerciseEquipmentFilter("all");
    setExercisePatternFilter("all");
    setExerciseDifficultyFilter("all");
  };
  const selectedMuscleDetail = muscleStats.find(muscle => muscle.slug === selectedMuscle);
  const selectedSession = sessions.find(session => session.id === selectedSessionId) ?? null;
  // Group the selected session by movement while preserving the recorded set order.
  const selectedSessionGroups = selectedSession ? selectedSession.sets.reduce<Array<{ exercise: Exercise; sets: WorkoutSession["sets"] }>>((groups, set) => {
    let group = groups.find(item => item.exercise.id === set.exercise.id);
    if (!group) {
      group = { exercise: set.exercise, sets: [] };
      groups.push(group);
    }
    group.sets.push(set);
    return groups;
  }, []) : [];

  return <main className="app-shell">
    <aside className="app-sidebar" aria-label="Application navigation">
      <a className="brand" href="/">FitLoop<span>.</span></a>
      <p className="sidebar-label">WORKSPACE</p>
      <nav className="sidebar-nav" aria-label="Main sections">
        <button className={activeTab === "home" ? "active" : ""} onClick={() => setActiveTab("home")}><span className="nav-symbol">⌂</span><span>Overview</span></button>
        <button className={activeTab === "workouts" ? "active" : ""} onClick={() => setActiveTab("workouts")}><span className="nav-symbol">↗</span><span>Workouts</span></button>
        <button className={activeTab === "community" ? "active" : ""} onClick={() => setActiveTab("community")}><span className="nav-symbol">◎</span><span>Community</span></button>
        <button className={activeTab === "coach" ? "active" : ""} onClick={() => setActiveTab("coach")}><span className="nav-symbol">✳</span><span>Coach</span></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-profile"><span className="profile-avatar">{(user?.username ?? "F").slice(0, 1).toUpperCase()}</span><span><strong>{user?.username ?? "Your account"}</strong><small>Personal workspace</small></span></div>
        <button className="sidebar-signout" onClick={signOut}>Sign out</button>
      </div>
    </aside>
    <div className="app-main">
      <header className="topbar">
        <div><p className="topbar-kicker">FITLOOP / WORKSPACE</p><strong>{activeTab === "home" ? "Overview" : activeTab === "workouts" ? "Workouts" : activeTab === "community" ? "Community" : "Coach"}</strong></div>
        <div className="account">{pendingWorkoutCount > 0 && <span className="offline-queue-status" role="status">{pendingWorkoutCount} workout{pendingWorkoutCount === 1 ? "" : "s"} waiting to sync</span>}<span className="account-status"><i /> Your space</span><button className="topbar-action" onClick={() => setActiveTab("workouts")}>Start a workout <span>↗</span></button></div>
      </header>
      <nav className="mobile-nav" aria-label="Main sections">
        <button className={activeTab === "home" ? "active" : ""} onClick={() => setActiveTab("home")}><span>⌂</span>Home</button>
        <button className={activeTab === "workouts" ? "active" : ""} onClick={() => setActiveTab("workouts")}><span>↗</span>Workouts</button>
        <button className={activeTab === "community" ? "active" : ""} onClick={() => setActiveTab("community")}><span>◎</span>Community</button>
        <button className={activeTab === "coach" ? "active" : ""} onClick={() => setActiveTab("coach")}><span>✳</span>Coach</button>
      </nav>

    {activeTab === "home" && <>
      {dashboardLoading && <p className="load-state" role="status">Loading your overview…</p>}
      {dashboardError && <div className="load-error" role="alert"><span>{dashboardError}</span><button type="button" className="secondary" onClick={() => void loadDashboard()}>Try again</button></div>}
      <section className="welcome">
        <p className="eyebrow">YOUR TRAINING SPACE</p>
        <h1>Your training, at a glance.</h1>
        <p className="muted">Pick up where you left off. Every session adds up.</p>
      </section>
      <section className="stats">
        <article><span>Workouts this week</span><strong>{sessionsThisWeek.length}</strong><small>Last 7 days</small></article>
        <article><span>Sets completed</span><strong>{completedSetsThisWeek}</strong><small>Across your sessions</small></article>
        <article><span>Daily check-ins</span><strong>{logs.length}<small> / 7</small></strong><small>Last 7 days</small></article>
      </section>
      <section className="panel section-gap recent-training">
        <div className="section-heading-row"><div><p className="eyebrow">KEEP YOUR MOMENTUM</p><h2>Recent training</h2></div><button className="subtle-action" onClick={() => setActiveTab("workouts")}>Open training <span>↗</span></button></div>
        {sessions.length === 0 && dashboardLoading ? <p className="muted" role="status">Loading recent training…</p> : sessions.length === 0 && dashboardError ? <p className="muted">Recent training is unavailable until the overview can be refreshed.</p> : sessions.length === 0 ? <div className="empty-training"><p className="muted">Your completed sessions will appear here. Start with a routine or build a one-off workout.</p><button onClick={() => setActiveTab("workouts")}>Build your first workout</button></div> :
          <div className="recent-session-list">{sessions.slice(0, 3).map(session => {
            const names = session.sets.map(set => set.exercise.name).filter((name, index, all) => all.indexOf(name) === index);
            const completed = session.sets.filter(set => set.completed).length;
            return <article className="recent-session" key={session.id}>
              <span className="session-mark">↗</span>
              <div><strong>{session.routine?.name ?? (names.slice(0, 2).join(" + ") || "Workout session")}</strong><small>{new Date(session.startedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {names.length} movements</small></div>
              <b>{completed} sets</b>
            </article>;
          })}</div>}
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
          {logs.length === 0 && dashboardLoading ? <p className="muted" role="status">Loading your check-ins…</p> : logs.length === 0 && dashboardError ? <p className="muted">Check-ins are unavailable until the overview can be refreshed.</p> : logs.length === 0 ? <p className="muted">Your check-ins will appear here once you log a day.</p> :
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
      {workoutsLoading && <p className="load-state" role="status">Loading your training data…</p>}
      {workoutsError && <div className="load-error" role="alert"><span>{workoutsError}</span><button type="button" className="secondary" onClick={() => void loadWorkouts()}>Try again</button></div>}
      <div className="welcome compact"><p className="eyebrow">MOVE AT YOUR OWN PACE</p><h1>Your workouts.</h1><p className="muted">Build a routine, log a session and keep a record of what you did.</p></div>
      <div className="content-grid">
        <form className="panel" onSubmit={createRoutine}>
          <p className="eyebrow">ROUTINE BUILDER</p><h2>{editingRoutineId ? "Edit routine" : "Create a routine"}</h2>
          <label>Routine name<input required maxLength={80} value={routineName} onChange={event => setRoutineName(event.target.value)} placeholder="e.g. Full body" /></label>
          <p className="field-heading">Choose exercises</p>
          <div className="exercise-picker">{exercises.map(exercise => <label className="check-row" key={exercise.id}>
            <input type="checkbox" checked={routineExerciseIds.includes(exercise.id)} onChange={event => setRoutineExerciseIds(current => event.target.checked ? [...current, exercise.id] : current.filter(id => id !== exercise.id))} />
            <span>{exercise.name}<small>{exercise.muscleGroup} · {exercise.equipment ?? "Equipment varies"}</small></span>
          </label>)}</div>
          <div className="routine-editor-actions"><button disabled={!routineName.trim() || routineExerciseIds.length === 0}>{editingRoutineId ? "Save changes" : "Save routine"}</button>{editingRoutineId && <button type="button" className="secondary" onClick={() => { setEditingRoutineId(""); setRoutineName(""); setRoutineExerciseIds([]); }}>Cancel edit</button>}</div>
        </form>
        <form className="panel" onSubmit={recordWorkout}>
          <p className="eyebrow">WORKOUT BUILDER</p><h2>Build a workout</h2>
          <p className="muted">Choose movements, edit each set and save the session together.</p>
          <label>Routine (optional)<select value={selectedRoutine} onChange={event => {
            const routine = routines.find(item => item.id === event.target.value);
            setSelectedRoutine(event.target.value);
            setSelectedExerciseIds(routine ? routine.exercises.map(item => item.exercise.id) : []);
          }}><option value="">One-off workout</option>{routines.map(routine => <option key={routine.id} value={routine.id}>{routine.name}</option>)}</select></label>
          <label>Search exercises<input value={exerciseSearch} onChange={event => setExerciseSearch(event.target.value)} placeholder="Search exercises, technique or equipment" /></label>
          <div className="exercise-filter-row">
            <label>Muscle group<select value={exerciseMuscleFilter} onChange={event => setExerciseMuscleFilter(event.target.value)}><option value="all">All muscles</option>{muscleStats.map(muscle => <option key={muscle.id} value={muscle.slug}>{muscle.name}</option>)}</select></label>
            <label>Equipment<select value={exerciseEquipmentFilter} onChange={event => setExerciseEquipmentFilter(event.target.value)}><option value="all">Any equipment</option>{Array.from(new Set(exercises.map(exercise => exercise.equipment ?? "Other"))).sort().map(equipment => <option key={equipment} value={equipment}>{equipment}</option>)}</select></label>
            <label>Movement pattern<select value={exercisePatternFilter} onChange={event => setExercisePatternFilter(event.target.value)}><option value="all">All movement patterns</option>{Array.from(new Set(exercises.map(exercise => exercise.movementPattern ?? "Other"))).sort().map(pattern => <option key={pattern} value={pattern}>{pattern}</option>)}</select></label>
            <label>Difficulty<select value={exerciseDifficultyFilter} onChange={event => setExerciseDifficultyFilter(event.target.value)}><option value="all">Any difficulty</option>{Array.from(new Set(exercises.map(exercise => exercise.difficulty ?? "Unspecified"))).sort().map(level => <option key={level} value={level}>{level}</option>)}</select></label>
          </div>
          <div className="exercise-results-summary" aria-live="polite">
            <span>Showing <strong>{visibleExercises.length}</strong> of <strong>{exercises.length}</strong> movements</span>
            {hasActiveExerciseFilters && <button type="button" className="text-button" onClick={clearExerciseFilters}>Clear filters</button>}
          </div>
          <div className="exercise-picker exercise-choice-grid" aria-label="Select exercises for this session">
            {visibleExercises.map(exercise => <article className={"check-row exercise-choice" + (selectedExerciseIds.includes(exercise.id) ? " selected" : "")} key={exercise.id}>
              <label className="exercise-choice-select">
                <input type="checkbox" checked={selectedExerciseIds.includes(exercise.id)} onChange={event => setSelectedExerciseIds(current => event.target.checked ? [...current, exercise.id] : current.filter(id => id !== exercise.id))} />
                <span className="exercise-choice-copy"><strong>{exercise.name}</strong><small>{exercise.muscleGroup} · {exercise.equipment ?? "Equipment varies"}</small>{exercise.movementPattern && <small>{exercise.movementPattern}</small>}</span>
                <span className="exercise-choice-indicator" aria-hidden="true">{selectedExerciseIds.includes(exercise.id) ? "✓" : "+"}</span>
              </label>
              <button type="button" className="exercise-detail-trigger" onClick={() => setExerciseDetailId(current => current === exercise.id ? "" : exercise.id)} aria-expanded={exerciseDetailId === exercise.id}>Details</button>
            </article>)}
            {visibleExercises.length === 0 && workoutsLoading && <p className="muted exercise-empty-state" role="status">Loading the exercise library…</p>}
            {visibleExercises.length === 0 && !workoutsLoading && (!workoutsError || exercises.length > 0) && <p className="muted exercise-empty-state">No movements match your search and filters. Try a different term or clear the filters.</p>}
            {visibleExercises.length === 0 && workoutsError && !workoutsLoading && <p className="muted exercise-empty-state">The exercise library could not be loaded. Use Try again above to retry.</p>}
          </div>
          {(() => {
            const detail = exercises.find(item => item.id === exerciseDetailId);
            if (!detail) return null;
            return <section className="exercise-detail-panel" aria-label={detail.name + " details"}>
              <div className="exercise-detail-heading"><div><p className="eyebrow">EXERCISE GUIDE</p><h3>{detail.name}</h3></div><button type="button" className="secondary" onClick={() => setExerciseDetailId("")}>Close</button></div>
              {detail.description && <p>{detail.description}</p>}
              <div className="exercise-detail-meta"><span>{detail.difficulty ?? "Difficulty not specified"}</span><span>{detail.category ?? "General training"}</span><span>{detail.bodyRegion ?? detail.muscleGroup}</span></div>
              {detail.instructions?.length ? <div><h4>How to perform it</h4><ol>{detail.instructions.map((step, index) => <li key={index}>{step}</li>)}</ol></div> : null}
              {detail.coachingCues?.length ? <div><h4>Coaching cues</h4><ul>{detail.coachingCues.map(cue => <li key={cue}>{cue}</li>)}</ul></div> : null}
              {detail.muscles?.length ? <div><h4>Muscles involved</h4><div className="exercise-detail-muscles">{detail.muscles.map(link => <span key={link.muscle.slug}><b>{link.muscle.name}</b><small>{link.role === "PRIMARY" ? "Primary" : "Secondary"}</small></span>)}</div></div> : null}
              {detail.equipmentAlternatives?.length ? <div><h4>Equipment alternatives</h4><p>{detail.equipmentAlternatives.join(" · ")}</p></div> : null}
              {detail.aliases?.length ? <p className="exercise-detail-aliases">Also known as: {detail.aliases.join(", ")}</p> : null}
            </section>;
          })()}
          <div className="selection-tray" aria-live="polite">
            <span><strong>{selectedExerciseIds.length}</strong> movements in this session</span>
            {selectedExerciseIds.length > 0 && <div className="selection-chips">{selectedExerciseIds.map(id => {
              const selected = exercises.find(exercise => exercise.id === id);
              return selected ? <button type="button" key={id} onClick={() => setSelectedExerciseIds(current => current.filter(item => item !== id))} aria-label={"Remove " + selected.name}>{selected.name}<span> ×</span></button> : null;
            })}</div>}
          </div>
          <GuidedRestTimer
            key={selectedExerciseIds.join("|")}
            items={selectedExerciseIds.flatMap(exerciseId => {
              const exercise = exercises.find(item => item.id === exerciseId);
              const draft = exerciseDrafts[exerciseId] ?? createDefaultExerciseDraft(exerciseId);
              return draft.setEntries.map((entry, index) => ({
                exerciseId,
                setId: entry.id,
                label: exercise?.name ?? "Exercise",
                setNumber: index + 1,
                reps: entry.reps,
                weight: entry.weight,
                restSeconds: Number(draft.restSeconds),
                completed: entry.completed
              }));
            })}
            onSetComplete={(exerciseId, setId) => setExerciseDrafts(current => {
              const draft = current[exerciseId] ?? createDefaultExerciseDraft(exerciseId);
              return {
                ...current,
                [exerciseId]: {
                  ...draft,
                  setEntries: draft.setEntries.map(entry => entry.id === setId ? { ...entry, completed: true } : entry)
                }
              };
            })}
          />
          <div className="exercise-session-list">
            {selectedExerciseIds.map(exerciseId => {
              const exercise = exercises.find(item => item.id === exerciseId);
              const draft = exerciseDrafts[exerciseId] ?? createDefaultExerciseDraft(exerciseId);
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
                  return { ...current, [exerciseId]: { ...currentDraft, setEntries: [...currentDraft.setEntries, { id: crypto.randomUUID(), reps: previous?.reps ?? "10", weight: previous?.weight ?? "", completed: false }] } };
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
        {routines.length === 0 && workoutsLoading ? <p className="muted" role="status">Loading saved routines…</p> : routines.length === 0 && workoutsError ? <p className="muted">Saved routines are unavailable until training data can be refreshed.</p> : routines.length === 0 ? <p className="muted">No routines yet. Choose a few exercises above to make your first one.</p> :
          <div className="routine-grid">{routines.map(routine => <article className="routine-card" key={routine.id}><strong>{routine.name}</strong><p className="muted">{routine.exercises.map(item => item.exercise.name).join(" · ")}</p><div className="routine-card-actions"><button type="button" className="secondary" onClick={() => editRoutine(routine)}>Edit</button><button type="button" className="danger-button" onClick={() => deleteRoutine(routine)}>Delete</button></div></article>)}</div>}
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
        {muscleEntries.length === 0 && workoutsLoading ? <p className="muted" role="status">Loading training breakdown…</p> : muscleEntries.length === 0 && workoutsError ? <p className="muted">Training breakdown is unavailable until training data can be refreshed.</p> : muscleEntries.length === 0 ? <p className="muted">Log a workout to see how your completed sets are distributed.</p> :
          <div className="volume-list">{muscleEntries.map(([group, count]) => <div className="volume-row" key={group}><span>{group}</span><div className="volume-track"><span style={{ width: (count / Math.max(...muscleEntries.map(item => item[1])) * 100) + "%" }} /></div><strong>{count}</strong></div>)}</div>}
        <p className="chart-note">This counts completed sets in the sessions currently loaded. It is not a measure of training quality.</p>
      </section>
      
<section className="panel section-gap">
  <section className="panel section-gap">
  <p className="eyebrow">PERSONAL BESTS</p><h2>Personal records</h2>
  <p className="muted">Your best completed set for each movement, based on the records you have logged.</p>
  {personalRecords.length === 0 && workoutsLoading ? <p className="muted" role="status">Loading personal records…</p> : personalRecords.length === 0 && workoutsError ? <p className="muted">Personal records are unavailable until training data can be refreshed.</p> : personalRecords.length === 0 ? <p className="muted">Complete a workout to start recording personal bests.</p> :
    <div className="personal-record-grid">{personalRecords.map(record => <article className="personal-record-card" key={record.exerciseId}>
      <strong>{record.exerciseName}</strong>
      <div className="personal-record-metrics">
        <div><span>HEAVIEST LOAD</span><b>{record.heaviestLoad ? record.heaviestLoad.value + " kg" : "—"}</b><small>{record.heaviestLoad?.date ? new Date(record.heaviestLoad.date).toLocaleDateString() : "No external load logged"}</small></div>
        <div><span>MOST REPS</span><b>{record.mostReps ? record.mostReps.value + " reps" : "—"}</b><small>{record.mostReps?.date ? new Date(record.mostReps.date).toLocaleDateString() : "No completed sets"}</small></div>
        <div><span>BEST SET VOLUME</span><b>{record.highestSetVolume ? Math.round(record.highestSetVolume.value).toLocaleString() + " kg" : "—"}</b><small>{record.highestSetVolume?.date ? new Date(record.highestSetVolume.date).toLocaleDateString() : "No external load logged"}</small></div>
      </div>
    </article>)}</div>}
  <p className="chart-note">Records use completed sets only. Loads and set volume reflect what was entered; bodyweight is not converted into an estimated load.</p>
</section>
<p className="eyebrow">PROGRESSION</p><h2>Movement progress</h2>
  <p className="muted">Compare your latest completed sets with your previous session for each movement.</p>
  {exerciseProgress.length === 0 && workoutsLoading ? <p className="muted" role="status">Loading movement progress…</p> : exerciseProgress.length === 0 && workoutsError ? <p className="muted">Movement progress is unavailable until training data can be refreshed.</p> : exerciseProgress.length === 0 ? <p className="muted">Log a completed workout to start building your movement history.</p> :
    <div className="progression-list">{exerciseProgress.map(item => <article className="progression-row" key={item.exerciseId}>
      <div className="progression-heading"><strong>{item.name}</strong><span>{new Date(item.date).toLocaleDateString()}</span></div>
      <div className="progression-metrics">
        <div><strong>{item.bestLoad > 0 ? item.bestLoad + " kg" : "Bodyweight"}</strong><span>TOP LOAD</span></div>
        <div><strong>{item.completedSets}</strong><span>SETS LOGGED</span></div>
        <div><strong>{item.latestVolume > 0 ? Math.round(item.latestVolume).toLocaleString() + " kg" : "—"}</strong><span>SESSION VOLUME</span></div>
      </div>
      <p className="progression-change">{item.loadChange === null ? (item.sessions > 1 ? "Load comparison unavailable for these sessions" : "Your next session will add a comparison") : item.loadChange > 0 ? "+" + item.loadChange + " kg from your previous session" : item.loadChange < 0 ? item.loadChange + " kg from your previous session" : "Same top load as your previous session"}</p>
      <div className="progression-trend" aria-label="Recent top-load trend">
        <div className="progression-trend-heading"><span>RECENT TOP-LOAD TREND</span><small>{item.history.length} sessions</small></div>
        <div className="progression-bars">
          {item.history.map((point, index) => {
            const maximum = Math.max(1, ...item.history.map(entry => entry.topLoad));
            const height = point.topLoad > 0 ? Math.max(12, point.topLoad / maximum * 100) : 8;
            return <div className="progression-bar-column" key={point.date + index} title={new Date(point.date).toLocaleDateString() + ": " + (point.topLoad > 0 ? point.topLoad + " kg" : "No external load logged")}>
              <strong>{point.topLoad > 0 ? point.topLoad + " kg" : "—"}</strong>
              <span className="progression-bar-track"><i style={{ height: height + "%" }} /></span>
              <small>{new Date(point.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</small>
            </div>;
          })}
        </div>
      </div>
    </article>)}</div>}
  <p className="chart-note">Load and volume use logged completed sets only. Bodyweight movements are not assigned an estimated load.</p>
</section>
<section className="panel section-gap">
        <p className="eyebrow">WORKOUT HISTORY</p><h2>Recent sessions</h2>
        {sessions.length === 0 && workoutsLoading ? <p className="muted" role="status">Loading workout history…</p> : sessions.length === 0 && workoutsError ? <p className="muted">Workout history is unavailable until training data can be refreshed.</p> : sessions.length === 0 ? <p className="muted">Completed workouts will show up here.</p> :
          <div className="history-session-list">{sessions.map(session => {
            const completedCount = session.sets.filter(set => set.completed).length;
            const movementCount = new Set(session.sets.map(set => set.exercise.id)).size;
            return <button
              className={"history-session-card" + (selectedSessionId === session.id ? " selected" : "")}
              key={session.id}
              onClick={() => setSelectedSessionId(current => current === session.id ? "" : session.id)}
              aria-expanded={selectedSessionId === session.id}
            >
              <span className="history-session-main"><strong>{session.routine?.name ?? "One-off workout"}</strong><small>{new Date(session.startedAt).toLocaleString()}</small></span>
              <span className="history-session-stats"><strong>{completedCount}/{session.sets.length}</strong><small>sets completed</small><strong>{movementCount}</strong><small>movements</small></span>
              <span className="history-session-arrow" aria-hidden="true">{selectedSessionId === session.id ? "−" : "+"}</span>
            </button>;
          })}</div>}
        {selectedSession && <section className="history-detail" aria-label="Selected workout details">
          <div className="history-detail-heading">
            <div><p className="eyebrow">SESSION DETAILS</p><h3>{selectedSession.routine?.name ?? "One-off workout"}</h3><p className="muted">{new Date(selectedSession.startedAt).toLocaleString()}</p></div>
            <button className="text-button" onClick={() => setSelectedSessionId("")}>Close details</button>
          </div>
          <div className="history-detail-summary">
            <span><strong>{selectedSession.sets.filter(set => set.completed).length}</strong> completed sets</span>
            <span><strong>{selectedSessionGroups.length}</strong> movements</span>
            <span><strong>{Math.round(selectedSession.sets.filter(set => set.completed).reduce((sum, set) => sum + set.reps * (set.weightKg ?? 0), 0)).toLocaleString()}</strong> kg logged volume</span>
          </div>
          {selectedSessionGroups.map(group => <article className="history-movement" key={group.exercise.id}>
            <div className="history-movement-heading"><strong>{group.exercise.name}</strong><span>{group.exercise.muscleGroup}</span></div>
            <div className="history-set-table" role="table" aria-label={group.exercise.name + " sets"}>
              <div className="history-set-row history-set-header" role="row"><span>SET</span><span>REPS</span><span>LOAD</span><span>STATUS</span></div>
              {group.sets.map((set, index) => <div className="history-set-row" role="row" key={set.id}>
                <span>{index + 1}</span><span>{set.reps}</span><span>{set.weightKg == null ? "Bodyweight / n/a" : set.weightKg + " kg"}</span><span className={set.completed ? "set-status-complete" : "set-status-skipped"}>{set.completed ? "Completed" : "Not completed"}</span>
              </div>)}
            </div>
          </article>)}
          {selectedSession.notes && <p className="history-session-notes"><strong>Session notes</strong>{selectedSession.notes}</p>}
        </section>}
      </section>
    </section>}

    {activeTab === "coach" && <section className="page-section">
      <div className="welcome compact"><p className="eyebrow">YOUR TRAINING COMPANION</p><h1>Meet your coach.</h1><p className="muted">Ask about your logged training, exercise technique or how to shape your next routine.</p></div>
      <CoachRoutineDraft
        exercises={exercises}
        plans={trainingPlans}
        plansLoading={trainingPlansLoading}
        saving={trainingPlanSaving}
        onSavePlan={saveTrainingPlan}
        onDeletePlan={deleteTrainingPlan}
        onStartDay={startTrainingPlanDay}
      />
      <div className="coach-chat-layout">
        <aside className="panel coach-conversation-list">
          <div className="section-heading-row"><h2>Conversations</h2><button type="button" className="small-button" onClick={() => void createCoachConversation()}>New chat +</button></div>
          {coachConversations.length === 0 && !coachChatLoading ? <p className="muted">Your conversations will appear here.</p> : coachConversations.map(conversation => <div className={"coach-conversation-row " + (activeCoachConversationId === conversation.id ? "active" : "")} key={conversation.id}>
            <button type="button" className="coach-conversation-select" onClick={() => setActiveCoachConversationId(conversation.id)}><strong>{conversation.title}</strong><small>{conversation._count?.messages ?? 0} messages</small></button>
            <button type="button" className="small-button" aria-label={"Delete " + conversation.title} onClick={() => void deleteCoachConversation(conversation.id)}>×</button>
          </div>)}
        </aside>
        <section className="panel coach-chat-panel">
          <div className="section-heading-row"><div><p className="eyebrow">FITLOOP COACH</p><h2>{coachConversations.find(item => item.id === activeCoachConversationId)?.title ?? "Start a conversation"}</h2></div></div>
          {coachChatLoading && <p className="load-state" role="status">Loading your conversation…</p>}
          {coachChatError && <div className="load-error" role="alert"><span>{coachChatError}</span><button type="button" className="secondary" onClick={() => activeCoachConversationId ? void loadCoachChat(activeCoachConversationId) : void loadCoachConversations()}>Try again</button></div>}
          <div className="coach-chat-messages" aria-live="polite">
            {coachChatMessages.length === 0 && <div className="coach-chat-empty"><strong>What would you like help with?</strong><p className="muted">Try asking about your recent progress, a training plan or an exercise in your library.</p></div>}
            {coachChatMessages.map(message => <article className={"coach-chat-bubble " + message.role} key={message.id}><span>{message.role === "assistant" ? "FitLoop Coach" : "You"}</span><p>{message.content}</p></article>)}
          </div>
          <form className="coach-chat-form" onSubmit={sendCoachMessage}>
            <label className="sr-only" htmlFor="coach-message">Message your coach</label>
            <textarea id="coach-message" value={coachDraft} onChange={event => setCoachDraft(event.target.value)} placeholder="Ask your coach something…" maxLength={2000} rows={3} />
            <button disabled={!coachDraft.trim() || coachChatSending}>{coachChatSending ? "Thinking…" : "Send message"}</button>
          </form>
          <p className="coach-disclosure">Early guided version: replies currently use transparent, rule-based coaching rather than a generative AI model. It is not medical advice. Model-provider integration will follow privacy, consent and safety review.</p>
          <p className="coach-context-disclosure"><strong>What informs a reply:</strong> When you send a message, FitLoop shares your message, coaching tone/focus preferences and up to five of your most recent logged workout sessions, including dates, routine names and completed exercise reps and loads. Private session notes, daily wellbeing logs and account identifiers are excluded.</p>
        </section>
      </div>
    </section>}

    {activeTab === "community" && <section className="page-section">
      {communityLoading && <p className="load-state" role="status">Loading your community…</p>}
      {communityError && <div className="load-error" role="alert"><span>{communityError}</span><button type="button" className="secondary" onClick={() => void loadCommunity()}>Try again</button></div>}
      <div className="welcome compact"><p className="eyebrow">BETTER TOGETHER</p><h1>Your community.</h1><p className="muted">Share completed workouts with people you've connected with.</p></div>
      <form className="panel community-profile-form" onSubmit={saveProfile}>
        <div><p className="eyebrow">YOUR PROFILE</p><h2>Make it yours</h2><p className="muted">Choose how your name and short introduction appear to accepted friends. Your email and private account details are never shown.</p></div>
        <label>Display name<input value={profileNameDraft} onChange={event => setProfileNameDraft(event.target.value)} maxLength={40} placeholder={user?.username ?? "Your name"} /></label>
        <label>Short bio<textarea value={profileBioDraft} onChange={event => setProfileBioDraft(event.target.value)} maxLength={160} rows={3} placeholder="A little about your training…" /></label>
        <div className="composer-footer"><small>{profileBioDraft.length}/160 · Visible to accepted friends</small><button disabled={profileSaving}>{profileSaving ? "Saving…" : "Save profile"}</button></div>
      </form>
      <div className="content-grid">
        <form className="panel" onSubmit={sendFriendRequest}>
          <p className="eyebrow">FIND YOUR PEOPLE</p><h2>Add a friend</h2>
          <label>FitLoop username<input required minLength={3} value={friendUsername} onChange={event => setFriendUsername(event.target.value)} placeholder="Enter their username" /></label>
          <button>Send friend request</button>
        </form>
        <section className="panel">
          <p className="eyebrow">YOUR CONNECTIONS</p><h2>Friends and requests</h2>
          {connections.length === 0 && communityLoading ? <p className="muted" role="status">Loading friends and requests…</p> : connections.length === 0 && communityError ? <p className="muted">Connections are unavailable until the community can be refreshed.</p> : connections.length === 0 ? <p className="muted">Your accepted friends and incoming requests will appear here.</p> :
            <ul className="log-list">{connections.map(connection => {
              const incoming = connection.addressee.id === user?.id;
              const person = incoming ? connection.requester : connection.addressee;
              return <li key={connection.id}><strong>{person.displayName || "@" + person.username}</strong><span>@{person.username} · {connection.status === "accepted" ? "Connected" : incoming ? "Waiting for your reply" : "Request sent"}</span>
                {connection.status === "pending" && incoming && <div className="connection-actions"><button type="button" className="small-button" onClick={() => void acceptFriendRequest(connection.id)}>Accept</button><button type="button" className="small-button secondary" onClick={() => void manageFriendRequest(connection.id, "decline")}>Decline</button></div>}
                {connection.status === "pending" && !incoming && <button type="button" className="small-button secondary" onClick={() => void manageFriendRequest(connection.id, "cancel")}>Cancel request</button>}
                {connection.status === "accepted" && <div className="connection-actions"><button type="button" className="small-button" onClick={() => void openCommunityProfile(person.id)}>View profile</button><button type="button" className="small-button secondary" onClick={() => void removeFriend(connection.id)}>Remove friend</button></div>}
                <div className="connection-actions"><button type="button" className="small-button secondary" onClick={() => void reportCommunityTarget("user", person.id)}>Report account</button><button type="button" className="small-button secondary" onClick={() => void blockCommunityUser(person.id)}>Block</button></div>
              </li>;
            })}</ul>}
        </section>
      </div>
      <section className="panel section-gap">
        <p className="eyebrow">PRIVACY & SAFETY</p><h2>Blocked accounts</h2>
        {blockedAccounts.length === 0 ? <p className="muted">You haven't blocked anyone.</p> : <ul className="log-list">{blockedAccounts.map(account => <li key={account.id}><strong>{account.displayName || "@" + account.username}</strong><span>@{account.username}</span><button type="button" className="small-button secondary" onClick={() => void unblockCommunityUser(account.id)}>Unblock</button></li>)}</ul>}
      </section>
      <form className="panel community-composer" onSubmit={createCommunityPost}>
        <p className="eyebrow">SHARE A MOMENT</p><h2>What's on your training mind?</h2>
        <label className="sr-only" htmlFor="community-post">Write a community update</label>
        <textarea id="community-post" value={communityPostDraft} onChange={event => setCommunityPostDraft(event.target.value)} placeholder="Share a win, a goal or a training thought with your friends…" rows={3} maxLength={500} />
        <div className="composer-footer"><small>{communityPostDraft.trim().length}/500 · Shared with accepted friends</small><button disabled={!communityPostDraft.trim()}>Share update</button></div>
      </form>
      <section className="panel section-gap">
        <div className="feed-section-heading">
          <div><p className="eyebrow">FRIENDS-ONLY FEED</p><h2>Recent activity</h2></div>
          <button type="button" className="small-button secondary feed-refresh" onClick={() => void refreshCommunityFeed()} disabled={feedRefreshing || feedLoadingMore}>
            {feedRefreshing ? "Refreshing…" : "Refresh feed"}
          </button>
        </div>
        {feedRefreshing && <p className="feed-refresh-status" role="status">Checking for new activity…</p>}
        {feedRefreshError && <div className="load-error" role="alert"><span>{feedRefreshError} Your current posts are still available.</span><button type="button" className="secondary" onClick={() => void refreshCommunityFeed()}>Try again</button></div>}
        {posts.length === 0 && communityLoading ? <p className="muted" role="status">Loading recent activity…</p> : posts.length === 0 && communityError ? <p className="muted">The feed is unavailable until the community can be refreshed.</p> : posts.length === 0 ? <p className="muted">No shared workouts yet. Once you and your friends log a session, it can appear here.</p> :
          <div className="feed-list">{posts.map(post => {
            const workoutSummary = post.session ? summariseWorkoutPost(post.session) : [];
            const commentCount = post._count?.comments ?? post.comments.length;
            return <article className="feed-card" key={post.id}>
            <div className="feed-heading"><div className="feed-author"><span className="feed-avatar" aria-hidden="true">{(post.user.displayName || post.user.username).slice(0, 1).toUpperCase()}</span><div><button type="button" className="feed-profile-link" onClick={event => { profileTriggerRef.current = event.currentTarget; void openCommunityProfile(post.user.id); }}>{post.user.displayName || "@" + post.user.username}</button><small>@{post.user.username}</small></div></div><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}</time></div>
            {post.text && editingPostId === post.id ? <form className="post-edit-form" onSubmit={event => void savePostEdit(event, post.id)}>
              <label className="sr-only" htmlFor={"edit-post-" + post.id}>Edit your update</label>
              <textarea id={"edit-post-" + post.id} value={editingPostDraft} onChange={event => setEditingPostDraft(event.target.value)} maxLength={500} rows={3} />
              <div className="composer-footer"><small>{editingPostDraft.trim().length}/500</small><div className="post-edit-actions"><button type="submit" disabled={!editingPostDraft.trim()}>Save edit</button><button type="button" className="secondary" onClick={cancelPostEdit}>Cancel</button></div></div>
            </form> : post.text ? <p className="community-post-text">{post.text}</p> : <p>{post.session?.routine?.name ?? "Completed a workout"}</p>}
            {post.session && <div className="workout-post-summary" aria-label="Workout summary">
              <div className="workout-post-metrics">
                <span><strong>{post.session.sets.filter(set => set.completed).length}</strong> sets completed</span>
                <span><strong>{workoutSummary.length}</strong> movements</span>
              </div>
              <div className="workout-post-movements">
                {workoutSummary.slice(0, 4).map(movement => <div className="workout-post-movement" key={movement.exerciseId}>
                  <strong>{movement.name}</strong><span>{movement.completedSets}/{movement.totalSets} sets</span>
                </div>)}
                {workoutSummary.length > 4 && <p className="workout-post-more">+{workoutSummary.length - 4} more movements</p>}
              </div>
            </div>}
            {post.user.id === user?.id && <div className="post-owner-actions">{post.type === "update" && editingPostId !== post.id && <button type="button" className="small-button secondary" onClick={() => startPostEdit(post)}>Edit post</button>}{editingPostId !== post.id && <button type="button" className="small-button post-delete" onClick={() => void deleteCommunityPost(post.id)}>Delete post</button>}</div>}
            {post.user.id !== user?.id && <div className="connection-actions"><button type="button" className="small-button secondary" onClick={() => void reportCommunityTarget("post", post.id)}>Report post</button><button type="button" className="small-button secondary" onClick={() => void blockCommunityUser(post.user.id)}>Block author</button></div>}
            <div className="reaction-row" aria-label="Post reactions">
              {([
                { value: "like", label: "Like", emoji: "👏" },
                { value: "strong", label: "Strong", emoji: "💪" },
                { value: "clap", label: "Clap", emoji: "🙌" }
              ] as const).map(reaction => {
                const selected = post.reactions.some(item => item.userId === user?.id && item.value === reaction.value);
                const count = post.reactions.filter(item => item.value === reaction.value).length;
                return <button key={reaction.value} type="button" className={`reaction-button${selected ? " is-selected" : ""}`}
                  aria-pressed={selected} onClick={() => void reactToPost(post.id, reaction.value)}>
                  {reaction.emoji} {reaction.label} <span className="reaction-count">{count}</span>
                </button>;
              })}
            </div>
            <section className="feed-comments" aria-label={`Comments, ${commentCount} total`}>
              <div className="feed-comments-heading"><strong>Comments</strong><span>{commentCount} {commentCount === 1 ? "comment" : "comments"}</span></div>
            {post.comments.map(comment => <div className="comment" key={comment.id}>
              {editingCommentId === comment.id ? <div className="comment-edit">
                <label className="sr-only" htmlFor={"edit-comment-" + comment.id}>Edit your comment</label>
                <input id={"edit-comment-" + comment.id} aria-label="Edit your comment" value={editingCommentDraft} maxLength={500} onChange={event => setEditingCommentDraft(event.target.value)} />
                <button type="button" className="small-button secondary" disabled={!editingCommentDraft.trim()} onClick={() => void saveCommentEdit(comment.id)}>Save</button>
                <button type="button" className="small-button secondary" onClick={() => { setEditingCommentId(null); setEditingCommentDraft(""); }}>Cancel</button>
              </div> : <><strong>@{comment.user.username}</strong> {comment.text}
                {comment.user.id === user?.id && <span className="comment-actions">
                  <button type="button" className="text-button" onClick={() => { setEditingCommentId(comment.id); setEditingCommentDraft(comment.text); }}>Edit</button>
                  <button type="button" className="text-button danger-text" onClick={() => void deleteComment(comment.id)}>Delete</button>
                </span>}
              </>}
            </div>)}
            {(post._count?.comments ?? post.comments.length) > post.comments.length && <button type="button" className="small-button secondary comment-load-more" onClick={() => void loadMoreComments(post.id)} disabled={Boolean(commentLoading[post.id])}>{commentLoading[post.id] ? "Loading older comments…" : "Load older comments"}</button>}
            {commentLoadErrors[post.id] && <div className="load-error" role="alert"><span>{commentLoadErrors[post.id]}</span><button type="button" className="secondary" onClick={() => void loadMoreComments(post.id)}>Try again</button></div>}
            <form className="comment-form" onSubmit={event => void commentOnPost(event, post.id)}>
              <input aria-label="Write a comment" value={commentDrafts[post.id] ?? ""} onChange={event => setCommentDrafts(current => ({ ...current, [post.id]: event.target.value }))} placeholder="Write a supportive comment..." maxLength={500} />
              <button disabled={!commentDrafts[post.id]?.trim()}>Send</button>
            </form>
            </section>
          </article>})}</div>}
        {feedHasMore && <button type="button" className="small-button secondary feed-load-more" onClick={() => void loadMoreCommunityPosts()} disabled={feedLoadingMore}>{feedLoadingMore ? "Loading older posts…" : "Load older posts"}</button>}
        {feedLoadMoreError && <div className="load-error" role="alert"><span>{feedLoadMoreError}</span><button type="button" className="secondary" onClick={() => void loadMoreCommunityPosts()}>Try again</button></div>}
      </section>

      {isModerator && <section className="panel section-gap" aria-labelledby="moderation-heading">
        <p className="eyebrow">PRIVATE OPERATIONS</p><h2 id="moderation-heading">Moderator review</h2>
        <p className="muted">Reports are visible only to accounts provisioned as moderators by the server operator.</p>
        <div className="composer-footer">
          <label htmlFor="moderation-status-filter">Report status</label>
          <select id="moderation-status-filter" value={moderationStatusFilter} onChange={event => {
            const next = event.target.value as ModerationReport["status"];
            setModerationStatusFilter(next);
            void loadModerationReports(next);
          }}>
            <option value="open">Open</option><option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
          </select>
          <button type="button" className="small-button secondary" onClick={() => void loadModerationReports()} disabled={moderationLoading}>{moderationLoading ? "Refreshing…" : "Refresh reports"}</button>
        </div>
        {moderationError && <p role="alert" className="muted">{moderationError}</p>}
        {moderationLoading && moderationReports.length === 0 ? <p role="status" className="muted">Loading private reports…</p>
          : moderationReports.length === 0 ? <p className="muted">No {moderationStatusFilter} reports.</p>
          : <div className="feed-list">{moderationReports.map(report => <article className="feed-card" key={report.id}>
            <div className="feed-heading"><strong>{report.reason.replaceAll("_", " ")}</strong><span>{new Date(report.createdAt).toLocaleString()}</span></div>
            <p className="muted">Reported by @{report.reporter.username}</p>
            {report.reportedUser && <p>Account: {report.reportedUser.displayName || "@" + report.reportedUser.username}</p>}
            {report.post && <p>Post by @{report.post.user.username}: {report.post.text || "Workout activity post"}</p>}
            {report.details && <p className="community-post-text">{report.details}</p>}
            {report.resolutionNote && <p className="muted">Previous decision: {report.resolutionNote}</p>}
            <label htmlFor={"moderation-note-" + report.id}>Resolution note</label>
            <textarea id={"moderation-note-" + report.id} aria-label={"Resolution note for " + report.id} value={moderationNoteDrafts[report.id] ?? ""} onChange={event => setModerationNoteDrafts(current => ({ ...current, [report.id]: event.target.value }))} rows={2} maxLength={1000} placeholder="Explain the action taken (at least 10 characters to close)." />
            <div className="connection-actions">
              {report.status === "open" && <button type="button" className="small-button secondary" onClick={() => void reviewCommunityReport(report.id, "reviewing")}>Start review</button>}
              {report.status === "reviewing" && <button type="button" className="small-button secondary" onClick={() => void reviewCommunityReport(report.id, "open")}>Return to open</button>}
              {(report.status === "resolved" || report.status === "dismissed") && <button type="button" className="small-button secondary" onClick={() => void reviewCommunityReport(report.id, "reviewing")}>Reopen for review</button>}
              {(report.status === "open" || report.status === "reviewing") && <>
                <button type="button" className="small-button secondary" disabled={(moderationNoteDrafts[report.id] ?? "").trim().length < 10} onClick={() => void reviewCommunityReport(report.id, "resolved")}>Resolve report</button>
                <button type="button" className="small-button secondary" disabled={(moderationNoteDrafts[report.id] ?? "").trim().length < 10} onClick={() => void reviewCommunityReport(report.id, "dismissed")}>Dismiss report</button>
              </>}
            </div>
          </article>)}</div>}
      </section>}
    </section>}

    {(profileViewLoading || profileViewError || viewedProfile) && <div className="profile-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeCommunityProfile(); }}>
      <section className="profile-dialog panel" role="dialog" aria-modal="true" aria-busy={profileViewLoading} aria-labelledby="community-profile-heading" aria-describedby="community-profile-privacy">
        <div className="profile-dialog-heading"><div><p className="eyebrow">COMMUNITY PROFILE</p><h2 id="community-profile-heading">{profileViewLoading ? "Loading profile…" : viewedProfile?.displayName || (viewedProfile ? "@" + viewedProfile.username : "Profile unavailable")}</h2></div>
          <button ref={profileDialogCloseRef} type="button" className="small-button secondary" onClick={closeCommunityProfile}>Close</button>
        </div>
        {profileViewLoading && <p role="status" className="muted">Checking profile visibility…</p>}
        {profileViewError && <p role="alert" className="load-error">{profileViewError}</p>}
        {viewedProfile && <>
          <p className="profile-dialog-username">@{viewedProfile.username}</p>
          <p className="profile-dialog-bio">{viewedProfile.bio || "This member hasn't added a bio yet."}</p>
        </>}
        <p id="community-profile-privacy" className="profile-dialog-privacy">Only profile information allowed by this member's privacy settings is shown. Private workout notes and account details are not part of a community profile.</p>
      </section>
    </div>}
    {notice && <p role="status" className="notice">{notice}</p>}
    <footer>Small steps count. FitLoop is a habit tracker, not medical advice.</footer>
    </div>
  </main>;
}
