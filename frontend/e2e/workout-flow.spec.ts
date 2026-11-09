
// Verify the install metadata and worker entry points are served, while API routes remain outside the shell cache.
test("app publishes an installable manifest and offline worker assets", async ({ page }) => {
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("FitLoop");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/fitloop.svg", purpose: "any" })
  ]));
  const iconResponse = await page.request.get("/icons/fitloop.svg");
  expect(iconResponse.ok()).toBeTruthy();
  expect(iconResponse.headers()["content-type"]).toContain("image/svg+xml");
  const workerResponse = await page.request.get("/sw.js");
  expect(workerResponse.ok()).toBeTruthy();
  const workerSource = await workerResponse.text();
  expect(workerSource).toContain("fitloop-shell-v2");
  expect(workerSource.split("event.respondWith(")).toHaveLength(3);
  expect(workerSource).toContain('url.pathname.startsWith("/api/")');
  expect(workerSource).toContain('cache.put("/", response.clone())');
  expect(workerSource).toContain('cache.put(request, response.clone())');
});
import { expect, test, type Page } from "@playwright/test";

const exercise = {
  id: "exercise-1",
  name: "Goblet squat",
  muscleGroup: "Quadriceps",
  equipment: "Dumbbell",
  movementPattern: "Squat",
  description: "A lower-body movement performed while holding a dumbbell at chest height.",
  category: "Strength",
  bodyRegion: "Lower body",
  difficulty: "Beginner",
  aliases: ["Dumbbell goblet squat"],
  instructions: ["Hold the weight close to your chest.", "Sit between your hips and stand tall."],
  coachingCues: ["Keep your whole foot grounded.", "Brace before each repetition."],
  equipmentAlternatives: ["Kettlebell"],
  muscles: [{ role: "PRIMARY", muscle: { name: "Quadriceps", slug: "quadriceps" } }]
};

async function mockApplicationApi(page: Page, onSessionSave?: (body: any) => void, sessionSaveStatus: number | (() => number) = 200, muscleStats: any[] = [], catalogueExercises: any[] = [exercise], onRoutineSave?: (body: any) => void, initialNotifications: any[] = []) {
  const routines: any[] = [];
  const trainingPlans: any[] = [];
  const conversations: any[] = [];
  const chatMessages: Record<string, any[]> = {};
  const socialPosts: any[] = [];
  // Copy fixtures so read-state updates behave like independent server requests.
  const activityNotifications = initialNotifications.map(notification => ({ ...notification }));
  // Keep the mock preference between requests so browser coverage can verify both consent and opt-out.
  let coachAiEnabled = false;
  await page.route("http://localhost:4000/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body: unknown = {};

    if (method === "POST" && url.pathname === "/api/auth/login") {
      body = { token: "browser-test-token", user: { id: "user-1", username: "tester" } };
    } else if (url.pathname === "/api/me") {
      body = { user: { id: "user-1", username: "tester" } };
    } else if (url.pathname === "/api/coach/preferences" && method === "GET") {
      body = { preference: { style: "gentle", focus: "energy", aiEnabled: coachAiEnabled } };
    } else if (url.pathname === "/api/coach/preferences" && method === "PUT") {
      const input = request.postDataJSON();
      coachAiEnabled = input.aiEnabled === true;
      body = { preference: { style: input.style, focus: input.focus, aiEnabled: coachAiEnabled } };
    } else if (url.pathname === "/api/daily-logs") {
      body = { logs: [] };
    } else if (url.pathname === "/api/coach/history") {
      body = { events: [] };
    } else if (url.pathname === "/api/coach/conversations" && method === "GET") {
      body = { conversations };
    } else if (url.pathname === "/api/coach/conversations" && method === "POST") {
      const conversation = { id: "chat-1", title: "New conversation", updatedAt: new Date().toISOString(), _count: { messages: 0 } };
      conversations.unshift(conversation);
      chatMessages[conversation.id] = [];
      body = { conversation };
    } else if (url.pathname === "/api/coach/conversations/chat-1/messages" && method === "GET") {
      body = { messages: chatMessages["chat-1"] ?? [] };
    } else if (url.pathname === "/api/coach/conversations/chat-1/messages" && method === "POST") {
      const input = request.postDataJSON();
      const messages = [
        { id: "chat-user-1", role: "user", content: input.message, createdAt: new Date().toISOString() },
        { id: "chat-assistant-1", role: "assistant", content: "I can see your recent FitLoop training. What goal would you like to focus on?", createdAt: new Date().toISOString() }
      ];
      chatMessages["chat-1"] = [...(chatMessages["chat-1"] ?? []), ...messages];
      conversations[0].title = input.message.slice(0, 70);
      conversations[0]._count.messages = chatMessages["chat-1"].length;
      body = { messages, responseMode: "guided_rules" };
    } else if (url.pathname === "/api/workouts/training-plans" && method === "GET") {
      body = { plans: trainingPlans };
    } else if (url.pathname === "/api/workouts/training-plans" && method === "POST") {
      const input = request.postDataJSON();
      const plan = {
        id: "plan-1", name: input.name, goal: input.goal, daysPerWeek: input.daysPerWeek,
        experience: input.experience, equipment: input.equipment,
        days: input.days.map((day: any, index: number) => ({
          id: "plan-day-" + (index + 1), dayNumber: day.dayNumber, label: day.label,
          routine: { id: "plan-routine-" + (index + 1), name: day.routineName,
            exercises: day.exercises.map((item: any) => ({ exercise: catalogueExercises.find(candidate => candidate.id === item.exerciseId) })) }
        }))
      };
      trainingPlans.unshift(plan);
      body = { plan };
    } else if (url.pathname === "/api/workouts/training-plans/plan-1" && method === "PUT") {
      const input = request.postDataJSON();
      const plan = {
        id: "plan-1", name: input.name, goal: input.goal, daysPerWeek: input.daysPerWeek,
        experience: input.experience, equipment: input.equipment,
        days: input.days.map((day: any, index: number) => ({
          id: "plan-day-" + (index + 1), dayNumber: day.dayNumber, label: day.label,
          routine: { id: "updated-routine-" + (index + 1), name: day.routineName,
            exercises: day.exercises.map((item: any) => ({ exercise: catalogueExercises.find(candidate => candidate.id === item.exerciseId) })) }
        }))
      };
      trainingPlans.splice(0, trainingPlans.length, plan);
      body = { plan };
    } else if (url.pathname === "/api/workouts/training-plans/plan-1" && method === "DELETE") {
      trainingPlans.splice(0, trainingPlans.length);
      body = { deleted: true };
    } else if (url.pathname === "/api/workouts/exercises") {
      body = { exercises: catalogueExercises };
    } else if (url.pathname === "/api/workouts/routines" && method === "GET") {
      body = { routines };
    } else if (url.pathname === "/api/workouts/routines" && method === "POST") {
      const input = request.postDataJSON();
      onRoutineSave?.(input);
      const routine = { id: "routine-1", name: input.name, exercises: input.exercises.map((item: any) => ({ exercise })) };
      routines.push(routine);
      body = { routine };
    } else if (url.pathname === "/api/workouts/routines/routine-1" && method === "PUT") {
      const input = request.postDataJSON();
      const routine = { id: "routine-1", name: input.name, exercises: input.exercises.map((item: any) => ({ exercise })) };
      routines.splice(0, routines.length, routine);
      body = { routine };
    } else if (url.pathname === "/api/workouts/routines/routine-1" && method === "DELETE") {
      routines.splice(0, routines.length);
      body = { deleted: true };
    } else if (url.pathname === "/api/workouts/sessions") {
      if (method === "POST") {
        onSessionSave?.(request.postDataJSON());
        const status = typeof sessionSaveStatus === "function" ? sessionSaveStatus() : sessionSaveStatus;
        if (status !== 200) {
          await route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify({ error: status === 401 ? "Please sign in again." : "The saved workout is no longer valid." })
          });
          return;
        }
        body = { session: { id: "session-1" } };
      } else {
        body = { sessions: [] };
      }
    } else if (url.pathname === "/api/workouts/progression-suggestions") {
      body = { suggestions: [{
        exerciseId: "exercise-1", exerciseName: "Goblet squat",
        recommendation: "consider_small_increase",
        reason: "You completed at least two more reps at the same load. If the sets felt controlled, consider the smallest available load increase next time.",
        latest: { reps: 10, weightKg: 20, date: "2026-11-08T10:00:00.000Z" },
        previous: { reps: 8, weightKg: 20, date: "2026-11-06T10:00:00.000Z" },
        recentSessions: [
          { reps: 10, weightKg: 20, date: "2026-11-08T10:00:00.000Z" },
          { reps: 8, weightKg: 20, date: "2026-11-06T10:00:00.000Z" },
          { reps: 12, weightKg: 18, date: "2026-11-04T10:00:00.000Z" }
        ]
      }] };
    } else if (url.pathname === "/api/workouts/personal-records") {
      body = { records: [{
        exerciseId: "exercise-1",
        exerciseName: "Goblet squat",
        heaviestLoad: { value: 32, date: "2026-11-03T18:00:00.000Z", sessionId: "session-pr" },
        mostReps: { value: 12, date: "2026-11-02T18:00:00.000Z", sessionId: "session-pr-old" },
        highestSetVolume: { value: 320, date: "2026-11-03T18:00:00.000Z", sessionId: "session-pr" }
      }] };
    } else if (url.pathname === "/api/workouts/muscle-stats") {
      body = { muscles: muscleStats };
    } else if (url.pathname === "/api/social/friends/discover") {
      body = { people: [{ id: "friend-candidate", username: "runnercandidate", displayName: "Runner Candidate" }] };
    } else if (url.pathname === "/api/social/friends/request" && method === "POST") {
      body = { connection: { id: "request-candidate", status: "pending" } };
    } else if (url.pathname === "/api/social/notifications" && method === "GET") {
      const cursor = url.searchParams.get("cursor");
      const startIndex = cursor ? Math.max(0, activityNotifications.findIndex(item => item.id === cursor) + 1) : 0;
      const pageSize = Number(url.searchParams.get("limit") ?? 20);
      const pageRows = activityNotifications.slice(startIndex, startIndex + pageSize);
      const hasMore = startIndex + pageRows.length < activityNotifications.length;
      body = {
        notifications: pageRows,
        unreadCount: activityNotifications.filter(item => !item.readAt).length,
        hasMore,
        nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null
      };
    } else if (url.pathname === "/api/social/notifications/read-all" && method === "POST") {
      const unread = activityNotifications.filter(item => !item.readAt);
      const readAt = new Date().toISOString();
      activityNotifications.forEach(item => { item.readAt = item.readAt ?? readAt; });
      body = { updated: unread.length };
    } else if (url.pathname.startsWith("/api/social/notifications/") && url.pathname.endsWith("/read") && method === "PATCH") {
      const id = url.pathname.split("/")[4];
      const target = activityNotifications.find(item => item.id === id);
      if (target) target.readAt = target.readAt ?? new Date().toISOString();
      body = { read: Boolean(target) };
    } else if (url.pathname === "/api/social/friends") {
      body = { connections: [] };
    } else if (url.pathname === "/api/social/blocks" && method === "GET") {
      body = { blocks: [] };
    } else if (url.pathname === "/api/social/posts" && method === "POST") {
      const input = request.postDataJSON();
      const post = { id: "post-text-1", type: "update", text: input.text, createdAt: new Date().toISOString(),
        user: { id: "user-1", username: "tester" }, reactions: [], comments: [] };
      socialPosts.unshift(post);
      body = { post };
    } else if (url.pathname === "/api/social/posts/post-text-1" && method === "DELETE") {
      socialPosts.splice(0, socialPosts.length);
      body = { deleted: true };
    } else if (url.pathname === "/api/social/profile/me/posts") {
      body = { posts: socialPosts.filter(post => post.user.id === "user-1"), hasMore: false, nextCursor: null };
    } else if (url.pathname === "/api/social/feed") {
      body = { posts: socialPosts };
    } else if (url.pathname === "/api/social/explore") {
      body = { posts: [], hasMore: false, nextCursor: null };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return socialPosts;
}


// Choose the correct workspace first, then use the navigation that is actually visible
// at the current viewport. This keeps the same journey valid on desktop and phones.
async function clickWorkspaceDestination(page: Page, workspace: "social" | "you", destination: string) {
  await page.locator(".workspace-switch-bar").getByRole("button", { name: workspace === "social" ? "Social" : "You" }).click();
  const navigation = page.locator((page.viewportSize()?.width ?? 1280) <= 820 ? ".mobile-nav" : ".sidebar-nav");
  const accessibleName = destination === "Feed" ? "Community"
    : destination === "Workout" ? "Workouts"
    : destination === "Stats" ? "Progress"
    : destination === "Plan" ? "Coach"
    : destination;
  await navigation.getByRole("button", { name: accessibleName, exact: true }).click();
}

async function clickWorkoutsNavigation(page: Page) {
  // Wait for authentication to finish rendering the app before choosing a responsive navigation variant.
  await expect(page.locator(".app-shell")).toBeVisible();
  const isMobileLayout = (page.viewportSize()?.width ?? 1280) <= 820;
  const navigation = page.locator(isMobileLayout ? ".mobile-nav" : ".sidebar-nav");
  const workoutsButton = navigation.getByRole("button", { name: "Workouts" });
  await expect(workoutsButton).toBeVisible();
  await workoutsButton.click();
}

async function signInAndOpenWorkouts(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await clickWorkoutsNavigation(page);
  await expect(page.getByRole("heading", { name: "Build a workout" })).toBeVisible();
  await expect(page.getByText("Goblet squat", { exact: true }).first()).toBeVisible();
  await page.locator(".exercise-choice").filter({ hasText: "Goblet squat" }).locator("input").check();
}

// The UI should show only record values derived from completed, valid sets.
test("personal records show the best completed load, reps and set volume", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await expect(page.getByRole("heading", { name: "Personal records" })).toBeVisible();
  const record = page.locator(".personal-record-card").filter({ hasText: "Goblet squat" });
  await expect(record.getByText("32 kg")).toBeVisible();
  await expect(record.getByText("12 reps")).toBeVisible();
  await expect(record.getByText("320 kg")).toBeVisible();
});

// Training stays one main destination, with short links for the separate jobs users return to most often.
test("Training shortcuts lead to the session, exercise library, routines and history", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  const shortcuts = page.locator(".workout-subnav");
  await expect(shortcuts.getByRole("link")).toHaveCount(4);
  await expect(shortcuts.getByRole("link", { name: "Session" })).toHaveAttribute("href", "#workout-session");
  await expect(shortcuts.getByRole("link", { name: "Exercises" })).toHaveAttribute("href", "#exercise-library");
  await expect(shortcuts.getByRole("link", { name: "Routines" })).toHaveAttribute("href", "#training-routines");
  await expect(shortcuts.getByRole("link", { name: "History" })).toHaveAttribute("href", "#workout-history");

  await shortcuts.getByRole("link", { name: "Exercises" }).click();
  await expect(page.locator("#exercise-library")).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Choose movements" })).toBeVisible();
});

// Editing and deletion must preserve the selected routine identity and leave the builder usable.
test("saved routines can be edited and deleted without losing the workout builder", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Routine name").fill("Starter routine");
  await page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Create a routine" }) })
    .locator(".exercise-picker input").check();
  await page.getByRole("button", { name: "Save routine" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Starter routine" })).toBeVisible();

  const routineCard = page.getByRole("article").filter({ hasText: "Starter routine" });
  await routineCard.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit routine" })).toBeVisible();
  await page.getByLabel("Routine name").fill("Updated routine");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Updated routine" })).toBeVisible();

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("article").filter({ hasText: "Updated routine" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No routines yet.")).toBeVisible();
});

// Only sets the user actually performs should contribute to the saved session.
test("guided sets mark only performed rows complete before saving", async ({ page }) => {
  let savedSession: any;
  await mockApplicationApi(page, body => { savedSession = body; });
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Rest (seconds)").fill("0");
  await page.getByRole("button", { name: "Start guided workout" }).click();
  await expect(page.getByText("Next set: Goblet squat · Set 1")).toBeVisible();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await expect(page.getByText("Next set: Goblet squat · Set 2")).toBeVisible();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();

  // The active workout intentionally covers the editor; end the guided stage before saving its preserved set records.
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Save complete session" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Workout saved" })).toBeVisible();
  expect(savedSession.sets).toHaveLength(3);
  expect(savedSession.sets.map((set: any) => set.completed)).toEqual([true, true, false]);
});

// Skipping a set moves the guide forward but must not inflate completed-work totals.
test("guided workout progress counts performed sets rather than skipped sets", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await page.getByRole("button", { name: "Start guided workout" }).click();
  await page.getByRole("button", { name: "Skip set" }).click();
  await expect(page.getByText("Next set: Goblet squat · Set 2")).toBeVisible();

  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await page.getByRole("button", { name: "Skip rest" }).click();
  await page.getByRole("button", { name: "Skip set" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Guided session finished. 1 of 3 sets completed." })).toBeVisible();
  await expect(page.getByText("1 of 3 sets completed in guided mode")).toBeVisible();
});

// A zero-rest final set completes synchronously, so its count must be included before the screen changes.
test("guided workout counts the final set when no rest period is configured", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Rest (seconds)").fill("0");
  await page.getByRole("button", { name: "Start guided workout" }).click();
  for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
    await expect(page.getByText(`Next set: Goblet squat · Set ${setNumber}`)).toBeVisible();
    await page.getByRole("button", { name: "Set complete — start rest" }).click();
  }

  await expect(page.getByRole("status").filter({ hasText: "All guided sets are complete." })).toBeVisible();
  await expect(page.getByText("3 of 3 sets completed in guided mode")).toBeVisible();
});

// Prevent an empty or entirely skipped session from appearing as a completed workout.
test("the workout cannot be saved until at least one set is completed", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await page.getByRole("button", { name: "Save complete session" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Complete at least one set before saving" })).toBeVisible();
});

// An offline save should be durable locally and reach the API once the connection returns.
test("completed workouts queue offline and sync once connectivity returns", async ({ page, context }) => {
  let savedSession: any;
  await mockApplicationApi(page, body => { savedSession = body; });
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Rest (seconds)").fill("0");
  await page.getByRole("button", { name: "Start guided workout" }).click();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await page.getByRole("button", { name: "End session" }).click();

  await context.setOffline(true);
  await page.getByRole("button", { name: "Save complete session" }).click();
  await expect(page.getByRole("status").filter({ hasText: "saved on this device" })).toBeVisible();
  await expect(page.locator(".offline-queue-status")).toContainText("1 workout waiting to sync");
  expect(savedSession).toBeUndefined();

  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "offline workouts have synced" })).toBeVisible();
  await expect(page.locator(".offline-queue-status")).toHaveCount(0);
  expect(savedSession.clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
});

// Exercise timer controls must keep the countdown state consistent across pause and skip actions.
test("the guided rest timer can pause, resume and skip its countdown", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await page.getByRole("button", { name: "Start guided workout" }).click();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByRole("button", { name: "Pause rest" }).click();
  await expect(page.getByRole("button", { name: "Resume rest" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Skip rest" }).click();
  await expect(page.getByText("Next set: Goblet squat · Set 2")).toBeVisible();
});

// The final set still needs its configured recovery interval before the workout is marked finished.
test("the final performed set receives its configured rest period", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Rest (seconds)").fill("1");
  await page.getByRole("button", { name: "Start guided workout" }).click();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await page.getByRole("button", { name: "Skip rest" }).click();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await page.getByRole("button", { name: "Skip rest" }).click();

  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await expect(page.getByText("Rest after Goblet squat · Set 3")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "All guided sets are complete." })).toBeVisible({ timeout: 3_000 });
});

// Navigation should match the available screen space instead of behaving like a responsive marketing site.
test("the app uses persistent navigation on desktop and a bottom tab bar on mobile", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator(".app-sidebar")).toBeVisible();
  await expect(page.locator(".sidebar-nav button")).toHaveCount(5);
  await expect(page.locator(".sidebar-nav button[aria-current=page]")).toHaveText("Home");
  await page.locator(".sidebar-nav").getByRole("button", { name: "Workouts" }).click();
  await expect(page.locator(".sidebar-nav button[aria-current=page]")).toHaveText("Workout");
  await expect(page.getByRole("heading", { name: "Build a workout" })).toBeVisible();

  // Tablet portrait uses the compact navigation layout; desktop retains the sidebar.
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(page.locator(".mobile-nav button")).toHaveCount(5);
  await expect(page.locator(".app-sidebar")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  const mobileNavButton = page.locator(".mobile-nav button").first();
  await expect.poll(() => mobileNavButton.evaluate(element => getComputedStyle(element).minHeight)).toBe("52px");
  await expect.poll(() => page.locator(".mobile-nav").evaluate(element => getComputedStyle(element).position)).toBe("fixed");
  await clickWorkspaceDestination(page, "you", "Stats");
  await expect(page.locator(".mobile-nav button[aria-current=page]")).toHaveText("Stats");
  await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await expect(page.locator(".mobile-nav button[aria-current=page]")).toHaveText("Feed");
  await expect(page.getByRole("heading", { name: "Your feed." })).toBeVisible();
  await expect(page.locator(".app-sidebar")).toBeHidden();

  // A narrow phone should keep every main destination inside the viewport without sideways scrolling.
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "You" }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  const assertNoHorizontalOverflow = async () => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };
  await clickWorkspaceDestination(page, "you", "Home");
  await assertNoHorizontalOverflow();
  await clickWorkspaceDestination(page, "you", "Workout");
  await assertNoHorizontalOverflow();
  await page.locator(".mobile-nav").getByRole("button", { name: "Progress" }).click();
  await assertNoHorizontalOverflow();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await assertNoHorizontalOverflow();
  await clickWorkspaceDestination(page, "you", "Plan");
  await assertNoHorizontalOverflow();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await expect(page.locator(".mobile-nav button")).toHaveCount(4);
  await assertNoHorizontalOverflow();
});

// Render the profile fields returned by the API without exposing fields the response omits.
test("Community profile previews respect the profile API response", async ({ page }) => {
  const socialPosts = await mockApplicationApi(page);
  socialPosts.push({
    id: "post-profile-preview", createdAt: "2026-11-06T10:00:00.000Z", text: "A friend's training update",
    user: { id: "user-2", username: "friend", displayName: "Friend" }, reactions: [], comments: []
  });
  let profileRequests = 0;
  await page.route("http://localhost:4000/api/social/profile/user-2", async route => {
    profileRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      profile: { id: "user-2", username: "friend", displayName: "Friend Athlete", bio: "Building strength one session at a time." }
    }) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await expect(page.locator(".feed-card")).toContainText("A friend's training update");
  await expect(page.locator(".feed-profile-link")).toBeVisible();
  await page.locator(".feed-profile-link").click();
  await expect(page.getByRole("dialog")).toContainText("Friend Athlete");
  await expect(page.getByRole("dialog")).toContainText("@friend");
  await expect(page.getByRole("dialog")).toContainText("Building strength one session at a time.");
  await expect(page.getByRole("dialog")).toContainText("Private workout notes and account details are not part");
  const profileTrigger = page.locator(".feed-profile-link");
  const closeProfile = page.getByRole("dialog").getByRole("button", { name: "Close" });
  await expect(closeProfile).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeProfile).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(closeProfile).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(profileTrigger).toBeFocused();
  await profileTrigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(profileRequests).toBe(2);
});


// Private and missing profiles should produce a safe state rather than stale or guessed details.
test("Community profile previews handle private or unavailable profiles safely", async ({ page }) => {
  const socialPosts = await mockApplicationApi(page);
  socialPosts.push({
    id: "post-private-profile", createdAt: "2026-11-07T10:00:00.000Z", text: "A friend's update",
    user: { id: "user-2", username: "friend", displayName: "Friend" }, reactions: [], comments: []
  });
  let profileRequests = 0;
  await page.route("http://localhost:4000/api/social/profile/user-2", async route => {
    profileRequests += 1;
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "This profile is private or unavailable." })
    });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const trigger = page.locator(".feed-profile-link");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("This profile is private or unavailable.");
  await expect(dialog).toContainText("Only profile information allowed by this member's privacy settings is shown.");
  await expect(dialog).not.toContainText("@friend");
  await expect(dialog).not.toContainText("private bio");
  const close = dialog.getByRole("button", { name: "Close" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(profileRequests).toBe(1);
});


// Ignore a response that arrives after the user has dismissed the profile preview.
test("closing a loading Community profile prevents a late response from reopening it", async ({ page }) => {
  const socialPosts = await mockApplicationApi(page);
  socialPosts.push({
    id: "post-slow-profile", createdAt: "2026-11-07T10:00:00.000Z", text: "A friend's update",
    user: { id: "user-2", username: "friend", displayName: "Friend" }, reactions: [], comments: []
  });
  await page.route("http://localhost:4000/api/social/profile/user-2", async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      profile: { id: "user-2", username: "friend", displayName: "Late response", bio: "This must not reopen the dialog." }
    }) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const trigger = page.locator(".feed-profile-link");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByRole("status")).toContainText("Checking profile visibility");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(650);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

// A slow or failed reaction request must not make the feed feel unresponsive or leave a false count behind.
test("Community reactions update immediately and roll back when the server rejects the change", async ({ page }) => {
  const socialPosts = await mockApplicationApi(page);
  socialPosts.push({
    id: "post-optimistic-reaction", type: "update", text: "Reaction rollback post",
    createdAt: "2026-11-08T10:00:00.000Z",
    user: { id: "friend-2", username: "friendtwo" },
    reactions: [{ userId: "friend-2", value: "like" }],
    comments: []
  });

  let releaseResponse!: () => void;
  let markRequestStarted!: () => void;
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
  const requestStarted = new Promise<void>(resolve => { markRequestStarted = resolve; });
  await page.route("**/api/social/posts/post-optimistic-reaction/reactions", async route => {
    markRequestStarted();
    await responseGate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Reaction service temporarily unavailable." })
    });
  });

  await signInAndOpenWorkouts(page);
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const post = page.locator(".feed-card").filter({ hasText: "Reaction rollback post" });
  const like = post.getByRole("button", { name: /Like/ });

  await expect(like).toHaveAttribute("aria-pressed", "false");
  await expect(like).toContainText("1");
  await like.click();
  await requestStarted;

  // The local count and selected state change while the server is deliberately held open.
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(like).toContainText("2");
  await expect(like).toBeDisabled();

  releaseResponse();
  await expect(page.getByText("Reaction service temporarily unavailable.")).toBeVisible();
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await expect(like).toContainText("1");
  await expect(like).toBeEnabled();
});

// Reaction state should support create, change and remove without duplicating a user's reaction.
test("Community reactions can be selected, changed and toggled off", async ({ page }) => {
  const socialPosts = await mockApplicationApi(page);
  let selected: string | null = null;
  await page.route("**/api/social/posts/post-text-1/reactions", async route => {
    const value = route.request().postDataJSON().value as string;
    selected = selected === value ? null : value;
    const post = socialPosts.find(item => item.id === "post-text-1");
    if (post) post.reactions = selected ? [{ userId: "user-1", postId: "post-text-1", value: selected }] : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      reaction: selected ? { userId: "user-1", postId: "post-text-1", value: selected } : null,
      removed: selected === null
    }) });
  });
  await signInAndOpenWorkouts(page);
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await page.getByLabel("Write a community update").fill("A reaction test post");
  await page.getByRole("button", { name: "Share update" }).click();
  const post = page.locator(".feed-card").filter({ hasText: "A reaction test post" });
  const like = post.getByRole("button", { name: /Like/ });
  const strong = post.getByRole("button", { name: /Strong/ });
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await strong.click();
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await expect(strong).toHaveAttribute("aria-pressed", "true");
  await strong.click();
  await expect(strong).toHaveAttribute("aria-pressed", "false");
});

// The exercise guide must expose the curated instruction and muscle relationships used by the catalogue.
test("exercise guide opens technique, coaching and muscle information", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  const exerciseCard = page.locator(".exercise-choice").filter({ hasText: "Goblet squat" });
  await exerciseCard.getByRole("button", { name: "Details" }).click();
  const guide = page.getByRole("region", { name: "Goblet squat details" });
  await expect(guide.getByRole("heading", { name: "Goblet squat" })).toBeVisible();
  await expect(guide.getByText("Hold the weight close to your chest.")).toBeVisible();
  await expect(guide.getByText("Keep your whole foot grounded.")).toBeVisible();
  await expect(guide.getByText("Quadriceps")).toBeVisible();
  await expect(guide.getByText("Kettlebell")).toBeVisible();
  await guide.getByRole("button", { name: "Close" }).click();
  await expect(guide).toHaveCount(0);
  await page.getByPlaceholder("Search exercises, technique or equipment").fill("whole foot grounded");
  await expect(page.locator(".exercise-choice")).toContainText("Goblet squat");
  await page.getByPlaceholder("Search exercises, technique or equipment").fill("");
});

// The named controls provide an accessible alternative to selecting shapes in the decorative SVG.
test("muscle map controls expose muscle names and training totals to assistive technology", async ({ page }) => {
  await mockApplicationApi(page, undefined, 200, [{
    id: "muscle-1",
    slug: "pectoralis-major",
    name: "Pectoralis major",
    view: "front",
    effectiveSets: 4,
    primarySets: 4,
    secondarySets: 0,
    lastTrainedAt: null,
    recoveryLabel: "Not trained in this period"
  }]);
  await signInAndOpenWorkouts(page);

  const selection = page.getByRole("group", { name: "front muscle selection" });
  const muscleButton = selection.getByRole("button", { name: "Pectoralis major, 4 effective sets" });
  await expect(muscleButton).toHaveAttribute("aria-pressed", "false");
  await muscleButton.click();
  await expect(muscleButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".muscle-detail")).toContainText("Pectoralis major");
  await expect(page.locator(".muscle-detail")).toContainText("4 weighted sets");
});

// Filtering the catalogue must not silently remove or misrepresent the movements already selected.
test("exercise filters and the selected-movement tray stay in sync", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Equipment").selectOption("Dumbbell");
  await page.getByLabel("Movement pattern").selectOption("Squat");
  await page.getByLabel("Difficulty").selectOption("Beginner");
  const exerciseChoice = page.locator(".exercise-choice").filter({ hasText: "Goblet squat" });
  await expect(exerciseChoice).toBeVisible();
  await exerciseChoice.locator("input").uncheck();
  await expect(page.getByText("0 movements in this session")).toBeVisible();
  await exerciseChoice.locator("input").check();
  await expect(page.getByText("1 movements in this session")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Goblet squat" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Goblet squat" }).click();
  await expect(page.getByRole("button", { name: "Remove Goblet squat" })).toHaveCount(0);

  await page.getByPlaceholder("Search exercises, technique or equipment").fill("movement-that-does-not-exist");
  await expect(page.getByText("No movements match your search and filters. Try a different term or clear the filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".exercise-choice").filter({ hasText: "Goblet squat" })).toBeVisible();
  await expect(page.locator(".exercise-results-summary")).toContainText("Showing 1 of 1 movements");
});


// The active screen should reflect performed sets and present a clear end-of-session summary.
test("active workout mode shows live progress and a completion summary", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Rest (seconds)").fill("0");
  await page.getByRole("button", { name: "Start guided workout" }).click();
  const activeWorkout = page.getByRole("region", { name: "Active workout" });
  await expect(activeWorkout).toBeVisible();
  await expect(activeWorkout.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  await expect(activeWorkout.getByText("Next set: Goblet squat · Set 1")).toBeVisible();

  await activeWorkout.getByRole("button", { name: "Set complete — start rest" }).click();
  await expect(activeWorkout.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await expect(activeWorkout.getByText("Next set: Goblet squat · Set 2")).toBeVisible();

  await activeWorkout.getByRole("button", { name: "Set complete — start rest" }).click();
  await activeWorkout.getByRole("button", { name: "Set complete — start rest" }).click();
  await expect(page.getByRole("status").filter({ hasText: "SESSION FINISHED" })).toBeVisible();
  await expect(page.getByText("3 sets completed in guided mode")).toBeVisible();
});


// Progress comparisons must use completed sessions for the same movement, not unrelated set history.
test("movement progress compares the latest completed load with the previous session", async ({ page }) => {
  await mockApplicationApi(page);
  await page.route("http://localhost:4000/api/workouts/sessions", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [
        { id: "session-new", startedAt: "2026-11-03T18:00:00.000Z", routine: null, sets: [
          { id: "set-new", reps: 8, weightKg: 24, completed: true, exercise }
        ] },
        { id: "session-old", startedAt: "2026-10-30T18:00:00.000Z", routine: null, sets: [
          { id: "set-old", reps: 8, weightKg: 22, completed: true, exercise }
        ] }
      ] })
    });
  });
  await signInAndOpenWorkouts(page);
  const progress = page.locator(".progression-row").filter({ hasText: "Goblet squat" });
  await expect(progress).toBeVisible();
  await expect(progress.locator(".progression-metrics > div:first-child strong")).toHaveText("24 kg");
  await expect(progress.getByText("+2 kg from your previous session")).toBeVisible();
  await expect(progress.getByLabel("Recent top-load trend")).toBeVisible();
  await expect(progress.locator(".progression-bar-column")).toHaveCount(2);
  await expect(progress.getByText("1", { exact: true })).toBeVisible();
});


// A historical session should preserve the detail needed to review each logged set.
test("workout history opens a session with its individual set results", async ({ page }) => {
  await mockApplicationApi(page);
  await page.route("http://localhost:4000/api/workouts/sessions", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [{
        id: "history-session",
        startedAt: "2026-11-02T17:30:00.000Z",
        routine: { name: "Upper body" },
        notes: "Kept the final set light.",
        sets: [
          { id: "history-set-1", reps: 10, weightKg: 20, completed: true, exercise },
          { id: "history-set-2", reps: 8, weightKg: 22, completed: true, exercise },
          { id: "history-set-3", reps: 8, weightKg: 24, completed: false, exercise }
        ]
      }] })
    });
  });
  await signInAndOpenWorkouts(page);

  const session = page.getByRole("button", { name: /Upper body/ });
  await expect(session).toBeVisible();
  await expect(session).toContainText("2/3");
  await session.click();

  const details = page.getByRole("region", { name: "Selected workout details" });
  await expect(details).toBeVisible();
  await expect(details.getByRole("heading", { name: "Upper body" })).toBeVisible();
  await expect(details.getByText("20 kg")).toBeVisible();
  await expect(details.getByText("22 kg")).toBeVisible();
  await expect(details.getByText("24 kg")).toBeVisible();
  await expect(details.getByText("Not completed")).toBeVisible();
  await expect(details.getByText("Kept the final set light.")).toBeVisible();

  await details.getByRole("button", { name: "Close details" }).click();
  await expect(details).toHaveCount(0);
});


// Local queued workouts must never be replayed under a different signed-in account.
test("offline workout storage stays account-scoped and supports safe cleanup", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const queue = await import("/src/offlineWorkoutQueue.ts");
    const first = await queue.queueWorkout("account-a", { sets: [{ exerciseId: "squat", reps: 8 }] });
    const second = await queue.queueWorkout("account-b", { sets: [{ exerciseId: "press", reps: 6 }] });
    const firstAccountEntries = await queue.getQueuedWorkouts("account-a");
    const secondAccountEntries = await queue.getQueuedWorkouts("account-b");
    await queue.removeQueuedWorkout(first.id);
    await queue.clearQueuedWorkouts("account-a");
    const afterCleanupA = await queue.getQueuedWorkouts("account-a");
    const afterCleanupB = await queue.getQueuedWorkouts("account-b");
    return {
      firstAccountIds: firstAccountEntries.map(entry => entry.id),
      secondAccountIds: secondAccountEntries.map(entry => entry.id),
      afterCleanupA: afterCleanupA.length,
      afterCleanupB: afterCleanupB.map(entry => entry.id),
      retainedAccountBId: second.id
    };
  });

  expect(result.firstAccountIds).toHaveLength(1);
  expect(result.secondAccountIds).toHaveLength(1);
  expect(result.firstAccountIds[0]).not.toBe(result.secondAccountIds[0]);
  expect(result.afterCleanupA).toBe(0);
  expect(result.afterCleanupB).toEqual([result.retainedAccountBId]);
});

// Reload and sign-out must not destroy a queue that belongs to the same account returning later.
test("offline workouts survive a reload and sign-out, then sync for the same account", async ({ page }) => {
  let syncCount = 0;
  await page.addInitScript(() => {
    Object.defineProperty(window, "__fitloopOnline", { value: false, writable: true });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => (window as any).__fitloopOnline });
  });
  await mockApplicationApi(page, () => { syncCount += 1; });
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Rest (seconds)").fill("0");
  await page.getByRole("button", { name: "Start guided workout" }).click();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await page.getByRole("button", { name: "End session" }).click();

  await page.getByRole("button", { name: "Save complete session" }).click();
  await expect(page.locator(".offline-queue-status")).toContainText("1 workout waiting to sync");
  expect(syncCount).toBe(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.locator(".offline-queue-status")).toContainText("1 workout waiting to sync");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".offline-queue-status")).toContainText("1 workout waiting to sync");
  expect(syncCount).toBe(0);

  await page.evaluate(() => {
    (window as any).__fitloopOnline = true;
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.getByRole("status").filter({ hasText: "offline workouts have synced" })).toBeVisible();
  await expect(page.locator(".offline-queue-status")).toHaveCount(0);
  expect(syncCount).toBe(1);
});

// A bad payload should be discarded so it cannot prevent valid later workouts from syncing.
test("a permanently invalid queued workout is removed without blocking the remaining queue", async ({ page, context }) => {
  await mockApplicationApi(page, undefined, 400);
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Rest (seconds)").fill("0");
  await page.getByRole("button", { name: "Start guided workout" }).click();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await page.getByRole("button", { name: "End session" }).click();

  await context.setOffline(true);
  await page.getByRole("button", { name: "Save complete session" }).click();
  await expect(page.locator(".offline-queue-status")).toContainText("1 workout waiting to sync");

  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "could not be synced because its details are no longer valid" })).toBeVisible();
  await expect(page.locator(".offline-queue-status")).toHaveCount(0);
});

// Authentication expiry is temporary; preserve the owner's unsynced workout for their next sign-in.
test("an expired session keeps queued workouts until the owner signs in again", async ({ page, context }) => {
  let saveAttempts = 0;
  await mockApplicationApi(page, () => { saveAttempts += 1; }, () => saveAttempts === 1 ? 401 : 200);
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Rest (seconds)").fill("0");
  await page.getByRole("button", { name: "Start guided workout" }).click();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await page.getByRole("button", { name: "End session" }).click();

  await context.setOffline(true);
  await page.getByRole("button", { name: "Save complete session" }).click();
  await expect(page.locator(".offline-queue-status")).toContainText("1 workout waiting to sync");

  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "waiting for you to sign in again" })).toBeVisible();
  await expect(page.locator(".offline-queue-status")).toContainText("1 workout waiting to sync");
  expect(saveAttempts).toBe(1);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("status").filter({ hasText: "offline workouts have synced" })).toBeVisible();
  await expect(page.locator(".offline-queue-status")).toHaveCount(0);
  expect(saveAttempts).toBe(2);
});

// Explain the limitation instead of promising offline recovery when browser storage cannot be used.
test("workout saving explains when browser offline storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.indexedDB, "open", {
      configurable: true,
      value: () => { throw new Error("Offline storage is not available in this browser."); }
    });
  });
  let savedSession: any;
  await mockApplicationApi(page, body => { savedSession = body; });
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Rest (seconds)").fill("0");
  await page.getByRole("button", { name: "Start guided workout" }).click();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Save complete session" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Offline storage is not available in this browser." })).toBeVisible();
  expect(savedSession).toBeUndefined();
});

// Keyboard users need a visible focus location and a complete path through the sign-in form.
test("sign-in remains usable with keyboard-only navigation and visible focus", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");

  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");
  const signIn = page.getByRole("button", { name: "Sign in" });

  await page.keyboard.press("Tab");
  await expect(email).toBeFocused();
  await expect.poll(() => email.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");

  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(signIn).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(email).toBeFocused();
});


// Screen readers should receive the loading status while the catalogue request is still pending.
test("workout loading state is announced before the exercise library arrives", async ({ page }) => {
  await mockApplicationApi(page);
  await page.route("http://localhost:4000/api/workouts/exercises", async route => {
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exercises: [exercise] }) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Workouts" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Loading your training data" })).toBeVisible();
  await expect(page.getByText("Goblet squat", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Loading your training data" })).toHaveCount(0);
});

// A network error must not look like a genuinely empty exercise catalogue.
test("a failed exercise-library request shows an explicit retry instead of an empty state", async ({ page }) => {
  await mockApplicationApi(page);
  let attempts = 0;
  await page.route("http://localhost:4000/api/workouts/exercises", async route => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Exercise service temporarily unavailable." }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exercises: [exercise] }) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Workouts" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Exercise service temporarily unavailable." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("No movements match your search and filters.")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Goblet squat", { exact: true }).first()).toBeVisible();
  expect(attempts).toBe(2);
});

// Confirm the app-shell Coach flow can create a private thread and render its non-AI fallback.
test("dedicated coach workspace creates a conversation and displays a guided reply", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await clickWorkspaceDestination(page, "you", "Plan");
  await expect(page.getByRole("heading", { name: "Build your week." })).toBeVisible();
  // Keep the conversation as the first Coach task; secondary analysis and planning should not push it below the fold.
  const coachSectionOrder = await page.locator(".coach-page > .coach-chat-layout, .coach-page > .progression-guidance, .coach-page > .coach-routine-builder").evaluateAll(elements => elements.map(element => element.className));
  expect(coachSectionOrder).toEqual(["coach-chat-layout", "panel progression-guidance", "panel coach-routine-builder"]);
  // Starter prompts lower the effort of the first message without sending content on the user's behalf.
  await page.getByRole("button", { name: "Review my progress" }).click();
  await expect(page.getByLabel("Message your coach")).toHaveValue("Review my recent training progress.");
  await page.getByLabel("Message your coach").fill("Can you help me review my progress?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".coach-chat-bubble.user")).toContainText("Can you help me review my progress?");
  await expect(page.locator(".coach-chat-bubble.assistant")).toContainText("I can see your recent FitLoop training.");
  const coachDisclosure = page.locator(".coach-disclosure");
  await expect(coachDisclosure).toContainText("FitLoop uses guided coaching by default.");
  await expect(coachDisclosure).toContainText("require your consent and a configured provider");
  await expect(coachDisclosure).toContainText("fall back to guided replies if the provider is unavailable.");
  const contextDisclosure = page.locator(".coach-context-disclosure");
  await expect(contextDisclosure).toContainText("up to five of your most recent logged workout sessions");
  await expect(contextDisclosure).toContainText("Private session notes, daily wellbeing logs and account identifiers are excluded.");
});

// Post editing is limited to the author and should update the visible feed entry.
test("authors can edit their own Community text updates", async ({ page }) => {
  await mockApplicationApi(page);
  let postText = "The original training update";
  let patchCalls = 0;
  const makePost = () => ({
    id: "post-editable", createdAt: "2026-11-08T10:00:00.000Z",
    type: "update", text: postText,
    user: { id: "user-1", username: "tester", displayName: "Tester" },
    reactions: [], comments: [], _count: { comments: 0 }
  });
  await page.route("http://localhost:4000/api/social/feed**", async route => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ posts: [makePost()], hasMore: false, nextCursor: null })
    });
  });
  await page.route("http://localhost:4000/api/social/posts/post-editable", async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    patchCalls += 1;
    postText = route.request().postDataJSON().text;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ post: makePost() }) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const card = page.locator(".feed-card").first();
  await expect(card).toContainText("The original training update");
  await card.getByRole("button", { name: "Edit post" }).click();
  await card.getByLabel("Edit your update").fill("A corrected training update");
  await card.getByRole("button", { name: "Save edit" }).click();
  await expect(page.locator(".feed-card")).toContainText("A corrected training update");
  await expect(page.getByText("The original training update")).toHaveCount(0);
  await expect(page.locator(".notice")).toContainText("Your update has been edited.");
  expect(patchCalls).toBe(1);
});

// New text updates should use the intended friends-only audience by default.
test("community users can share a friends-only text update", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await expect(page.getByRole("heading", { name: "Your feed." })).toBeVisible();
  await page.getByLabel("Write a community update").fill("First week back in the gym. Feeling good about the progress.");
  await page.getByRole("button", { name: "Share update" }).click();
  await expect(page.locator(".feed-card")).toContainText("First week back in the gym. Feeling good about the progress.");
  await expect(page.getByText(/Shared with accepted friends/)).toBeVisible();
});


// Distinguish a successful empty feed from a failed request, and allow the user to retry.
test("Community feed retries an initial failure and then shows a genuine empty state", async ({ page }) => {
  await mockApplicationApi(page);
  let feedRequests = 0;
  await page.route("http://localhost:4000/api/social/feed**", async route => {
    feedRequests += 1;
    if (feedRequests === 1) {
      await route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "Community feed is temporarily unavailable." })
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ posts: [], hasMore: false, nextCursor: null })
    });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const error = page.getByRole("alert").filter({ hasText: "Community feed is temporarily unavailable." });
  await expect(error).toBeVisible();
  await expect(page.locator(".activity-inbox")).toContainText("Activity is unavailable until the community can be refreshed.");
  await expect(page.locator(".activity-inbox")).not.toContainText("Friend requests, reactions and comments will appear here.");
  await expect(page.getByText("No shared workouts yet. Once you and your friends log a session, it can appear here.")).toHaveCount(0);
  await error.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No shared workouts yet. Once you and your friends log a session, it can appear here.")).toBeVisible();
  await expect(page.locator(".feed-card")).toHaveCount(0);
  expect(feedRequests).toBe(2);
});

// The moderation controls must submit the selected target to the server rather than only changing local UI.
test("community block and report controls call the moderation API", async ({ page }) => {
  await mockApplicationApi(page);
  const calls: Array<{ path: string; method: string }> = [];
  await page.route("http://localhost:4000/api/social/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push({ path: url.pathname, method: request.method() });
    if (url.pathname === "/api/social/friends") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connections: [{
        id: "connection-1", status: "accepted",
        requester: { id: "user-1", username: "tester", displayName: "Tester" },
        addressee: { id: "user-2", username: "friend", displayName: "Friend" }
      }] }) });
      return;
    }
    if (url.pathname === "/api/social/blocks") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ blocks: [] }) });
      return;
    }
    if (url.pathname === "/api/social/feed") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ posts: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ blocked: true, report: { id: "report-1", status: "open" } }) });
  });
  page.on("dialog", dialog => dialog.accept());
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await clickWorkspaceDestination(page, "social", "Explore");
  await expect(page.getByRole("heading", { name: "Friends and requests" })).toBeVisible();
  await page.getByRole("button", { name: "Report account" }).click();
  await expect(page.getByRole("status")).toContainText("Report submitted privately");
  expect(calls.some(call => call.path === "/api/social/reports" && call.method === "POST")).toBeTruthy();
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("Account blocked");
  expect(calls.some(call => call.path === "/api/social/blocks/user-2" && call.method === "POST")).toBeTruthy();
});


// Search runs on demand and a selected result becomes a normal username-based friend request.
test("Community members can search for people and send a friend request from a result", async ({ page }) => {
  // Reuse the shared auth and dashboard mocks; the more specific route below overrides only Community calls.
  await mockApplicationApi(page);
  const calls: Array<{ path: string; method: string; body?: any }> = [];
  await page.route("http://localhost:4000/api/social/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = method === "POST" ? request.postDataJSON() : undefined;
    calls.push({ path: url.pathname, method, body });

    if (url.pathname === "/api/social/friends/discover") {
      expect(url.searchParams.get("q")).toBe("runner");
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ people: [{ id: "candidate-1", username: "runnercandidate", displayName: "Runner Candidate" }] }) });
      return;
    }
    if (url.pathname === "/api/social/friends" || url.pathname === "/api/social/blocks") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connections: [], blocks: [] }) });
      return;
    }
    if (url.pathname === "/api/social/feed") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ posts: [] }) });
      return;
    }
    if (url.pathname === "/api/social/friends/request") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ connection: { id: "request-1" } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await clickWorkspaceDestination(page, "social", "Explore");

  await page.getByLabel("Search by username or display name").fill("runner");
  await page.getByRole("button", { name: "Search people" }).click();
  await expect(page.getByRole("list", { name: "People you can connect with" }).getByText("Runner Candidate")).toBeVisible();
  await page.getByRole("button", { name: "Add friend" }).click();

  await expect(page.locator(".notice")).toContainText("Friend request sent");
  expect(calls.some(call => call.path === "/api/social/friends/discover" && call.method === "GET")).toBeTruthy();
  expect(calls.find(call => call.path === "/api/social/friends/request" && call.method === "POST")?.body).toEqual({ username: "runnercandidate" });
});

// Keep already loaded posts visible when a background refresh cannot reach the API.
test("Community feed refreshes the first page and preserves posts when refresh fails", async ({ page }) => {
  await mockApplicationApi(page);
  let feedRequests = 0;
  const makePost = (id: string, text: string, comments: Array<{ id: string; text: string }> = []) => ({
    id, createdAt: "2026-11-08T10:00:00.000Z", text, type: "update",
    user: { id: "user-2", username: "friend", displayName: "Friend" },
    reactions: [],
    comments: comments.map(comment => ({
      ...comment, createdAt: "2026-11-08T10:01:00.000Z",
      user: { id: "user-2", username: "friend", displayName: "Friend" }
    })),
    _count: { comments: comments.length }
  });
  await page.route("http://localhost:4000/api/social/feed", async route => {
    feedRequests += 1;
    if (feedRequests === 2) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Feed refresh temporarily unavailable." }) });
    }
    const posts = feedRequests === 1
      ? [
          makePost("post-initial", "The activity already on screen"),
          makePost("post-single-comment", "A post with one comment", [{ id: "comment-one", text: "Good work" }]),
          makePost("post-multiple-comments", "A post with multiple comments", [
            { id: "comment-two", text: "First reply" },
            { id: "comment-three", text: "Second reply" }
          ])
        ]
      : [makePost("post-refreshed", "A newly shared training update")];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      posts, hasMore: false, nextCursor: null
    }) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await expect(page.getByText("The activity already on screen")).toBeVisible();
  await expect(page.locator(".feed-card").filter({ hasText: "The activity already on screen" }).locator("time")).toHaveAttribute("datetime", "2026-11-08T10:00:00.000Z");
  await expect(page.locator(".feed-card").filter({ hasText: "The activity already on screen" }).locator(".feed-comments-heading")).toContainText("0 comments");
  await expect(page.locator(".feed-card").filter({ hasText: "A post with one comment" }).locator(".feed-comments-heading")).toContainText("1 comment");
  await expect(page.locator(".feed-card").filter({ hasText: "A post with multiple comments" }).locator(".feed-comments-heading")).toContainText("2 comments");
  await page.getByRole("button", { name: "Refresh feed" }).click();
  await expect(page.getByRole("alert")).toContainText("Feed refresh temporarily unavailable.");
  await expect(page.getByText("The activity already on screen")).toBeVisible();
  await page.getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("A newly shared training update")).toBeVisible();
  await expect(page.getByText("The activity already on screen")).toHaveCount(0);
  expect(feedRequests).toBe(3);
});

// Cursor pagination should append older posts while retaining the current page.
test("community feed loads older posts without replacing the first page", async ({ page }) => {
  await mockApplicationApi(page);
  let feedRequests = 0;
  const makePost = (id: string, text: string) => ({
    id, createdAt: "2026-11-06T10:00:00.000Z", text, type: "update",
    user: { id: "user-2", username: "friend", displayName: "Friend" },
    reactions: [], comments: []
  });
  await page.route("http://localhost:4000/api/social/feed**", async route => {
    feedRequests += 1;
    const url = new URL(route.request().url());
    const olderPage = url.searchParams.has("cursor");
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(olderPage
        ? { posts: [makePost("post-older", "An older training update")], hasMore: false, nextCursor: null }
        : { posts: [makePost("post-newest", "The latest training update")], hasMore: true, nextCursor: "cursor-one" })
    });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await expect(page.getByText("The latest training update")).toBeVisible();
  await page.getByRole("button", { name: "Load older posts" }).click();
  await expect(page.getByText("An older training update")).toBeVisible();
  await expect(page.getByText("The latest training update")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load older posts" })).toHaveCount(0);
  expect(feedRequests).toBe(2);
});

// A failed older-page request should be recoverable without discarding posts already displayed.
test("Community feed pagination offers a retry after a temporary failure", async ({ page }) => {
  await mockApplicationApi(page);
  let olderPageRequests = 0;
  const makePost = (id: string, text: string) => ({
    id, createdAt: "2026-11-06T10:00:00.000Z", text, type: "update",
    user: { id: "user-2", username: "friend", displayName: "Friend" },
    reactions: [], comments: []
  });
  await page.route("http://localhost:4000/api/social/feed**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("cursor")) {
      olderPageRequests += 1;
      if (olderPageRequests === 1) {
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary feed failure." }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        posts: [makePost("post-older", "An older training update")], hasMore: false, nextCursor: null
      }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      posts: [makePost("post-newest", "The latest training update")], hasMore: true, nextCursor: "cursor-one"
    }) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await page.getByRole("button", { name: "Load older posts" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Temporary feed failure." })).toBeVisible();
  await page.getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("An older training update")).toBeVisible();
  await expect(page.getByText("The latest training update")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load older posts" })).toHaveCount(0);
  expect(olderPageRequests).toBe(2);
});

// Comment pagination should retain existing discussion when loading the next page fails.
test("Community comment pagination offers a retry without losing loaded comments", async ({ page }) => {
  const socialPosts = await mockApplicationApi(page);
  const comments = Array.from({ length: 20 }, (_, index) => ({
    id: "comment-" + (index + 1), text: "Comment " + (index + 1),
    user: { id: "user-2", username: "friend" }
  }));
  socialPosts.push({
    id: "post-comments", createdAt: "2026-11-06T10:00:00.000Z", text: "A post with many comments",
    user: { id: "user-2", username: "friend" }, reactions: [], comments, _count: { comments: 21 }
  });
  let olderCommentRequests = 0;
  await page.route("http://localhost:4000/api/social/posts/post-comments/comments**", async route => {
    olderCommentRequests += 1;
    if (olderCommentRequests === 1) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary comment failure." }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      comments: [{ id: "comment-21", text: "Comment 21", user: { id: "user-2", username: "friend" } }],
      hasMore: false, nextCursor: null
    }) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const card = page.locator(".feed-card").filter({ hasText: "A post with many comments" });
  await expect(card.locator(".comment").first()).toContainText("Comment 1");
  await card.getByRole("button", { name: "Load older comments" }).click();
  await expect(card.getByRole("alert").filter({ hasText: "Temporary comment failure." })).toBeVisible();
  await card.getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(card.locator(".comment").last()).toContainText("Comment 21");
  await expect(card.locator(".comment").first()).toContainText("Comment 1");
  await expect(card.getByRole("button", { name: "Load older comments" })).toHaveCount(0);
  expect(olderCommentRequests).toBe(2);
});

// Only server-allowlisted moderators should see the private review queue and record a decision.
test("allowlisted moderators can review and resolve private community reports", async ({ page }) => {
  let reportOpen = true;
  const report = {
    id: "report-1", reason: "harassment", details: "Repeated abusive messages.",
    status: "open", createdAt: "2026-11-06T10:00:00.000Z", reviewedAt: null, resolutionNote: null,
    reporter: { id: "user-2", username: "reporter", displayName: "Reporter" },
    reportedUser: { id: "user-3", username: "target", displayName: "Target" }, post: null
  };
  const calls: Array<{ path: string; method: string; body?: any }> = [];
  await mockApplicationApi(page);
  await page.route("http://localhost:4000/api/social/**", async route => {
    const request = route.request(), url = new URL(request.url());
    const body = request.method() === "PATCH" ? request.postDataJSON() : undefined;
    calls.push({ path: url.pathname, method: request.method(), body });
    if (url.pathname === "/api/social/friends") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connections: [] }) });
    if (url.pathname === "/api/social/blocks") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ blocks: [] }) });
    if (url.pathname === "/api/social/feed") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ posts: [], hasMore: false, nextCursor: null }) });
    if (url.pathname === "/api/social/moderation/capability") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ isModerator: true }) });
    if (url.pathname === "/api/social/moderation/reports") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: reportOpen ? [report] : [], hasMore: false, nextCursor: null }) });
    if (url.pathname === "/api/social/moderation/reports/report-1" && request.method() === "PATCH") {
      reportOpen = false;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ updated: true, status: body.status }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await expect(page.getByRole("heading", { name: "Moderator review" })).toBeVisible();
  await expect(page.getByText("Repeated abusive messages.")).toBeVisible();
  await page.getByLabel("Resolution note for report-1").fill("Reviewed and action taken.");
  await page.getByRole("button", { name: "Resolve report" }).click();
  await expect(page.getByText("No open reports.")).toBeVisible();
  expect(calls.some(call => call.path === "/api/social/moderation/reports/report-1" && call.method === "PATCH" && call.body.status === "resolved" && call.body.resolutionNote === "Reviewed and action taken.")).toBeTruthy();
});

// Shared workout summaries should count completed work without presenting skipped sets as training.
test("Community workout cards summarise completed sets by movement", async ({ page }) => {
  const socialPosts = await mockApplicationApi(page);
  socialPosts.push({
    id: "workout-post-summary", createdAt: "2026-11-07T08:00:00.000Z",
    user: { id: "friend-1", username: "trainingfriend" }, reactions: [], comments: [],
    session: {
      id: "session-shared", startedAt: "2026-11-07T07:00:00.000Z",
      routine: { name: "Upper body" },
      notes: "This private session note must not appear in the feed.",
      sets: [
        { id: "set-1", reps: 10, weightKg: 20, completed: true, exercise: { id: "exercise-1", name: "Goblet squat" } },
        { id: "set-2", reps: 8, weightKg: 22, completed: true, exercise: { id: "exercise-1", name: "Goblet squat" } },
        { id: "set-3", reps: 12, weightKg: null, completed: false, exercise: { id: "exercise-2", name: "Push-up" } }
      ]
    }
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const card = page.locator(".feed-card").filter({ hasText: "Upper body" });
  await expect(card.locator(".workout-post-metrics span").nth(0)).toContainText("2");
  await expect(card.locator(".workout-post-metrics span").nth(0)).toContainText("sets completed");
  await expect(card.locator(".workout-post-metrics span").nth(1)).toContainText("2");
  await expect(card.locator(".workout-post-metrics span").nth(1)).toContainText("movements");
  await expect(card.getByText("Goblet squat")).toBeVisible();
  await expect(card.getByText("2/2 sets")).toBeVisible();
  await expect(card.getByText("Push-up")).toBeVisible();
  await expect(card.getByText("0/1 sets")).toBeVisible();
  await expect(card.getByText("This private session note must not appear in the feed.")).toHaveCount(0);
});

// Older comments should be appended in chronological context rather than replacing the current discussion.
test("Community posts can load older comments without replacing the first page", async ({ page }) => {
  const socialPosts = await mockApplicationApi(page);
  const firstPage = Array.from({ length: 20 }, (_, index) => ({
    id: "comment-" + (index + 1),
    text: "Comment number " + (index + 1),
    user: { id: "friend-1", username: "trainingfriend" }
  }));
  socialPosts.push({
    id: "post-with-comments", type: "update", text: "A busy discussion",
    createdAt: "2026-11-07T08:00:00.000Z",
    user: { id: "friend-1", username: "trainingfriend" },
    reactions: [], comments: firstPage, _count: { comments: 22 }
  });
  await page.route("**/api/social/posts/post-with-comments/comments?*", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      comments: [21, 22].map(index => ({
        id: "comment-" + index,
        text: "Comment number " + index,
        user: { id: "friend-1", username: "trainingfriend" }
      })),
      hasMore: false, nextCursor: null
    }) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const post = page.locator(".feed-card").filter({ hasText: "A busy discussion" });
  const renderedComments = post.locator(".comment");
  await expect(renderedComments).toHaveCount(20);
  await expect(renderedComments.nth(0)).toContainText("Comment number 1");
  await expect(renderedComments.nth(19)).toContainText("Comment number 20");
  await post.getByRole("button", { name: "Load older comments" }).click();
  await expect(renderedComments).toHaveCount(22);
  await expect(renderedComments.nth(20)).toContainText("Comment number 21");
  await expect(renderedComments.nth(21)).toContainText("Comment number 22");
  await expect(renderedComments.nth(0)).toContainText("Comment number 1");
  await expect(post.getByRole("button", { name: "Load older comments" })).toHaveCount(0);
});

// Comment mutation controls must enforce author ownership for both edit and delete.
test("Community comment authors can edit and delete only their own comments", async ({ page }) => {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const comments = [{ id: "comment-own", text: "Great session", user: { id: "user-1", username: "tester" } }];
  await mockApplicationApi(page);
  await page.route("http://localhost:4000/api/social/**", async route => {
    const req = route.request(), url = new URL(req.url());
    const body = req.method() === "PATCH" ? req.postDataJSON() : undefined;
    calls.push({ method: req.method(), path: url.pathname, body });
    if (url.pathname === "/api/social/friends") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ connections: [] }) });
    if (url.pathname === "/api/social/blocks") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ blocks: [] }) });
    if (url.pathname === "/api/social/moderation/capability") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ isModerator: false }) });
    if (url.pathname === "/api/social/feed") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ posts: [{ id: "post-own", type: "update", text: "My training update", createdAt: "2026-11-07T08:00:00.000Z", user: { id: "user-1", username: "tester" }, reactions: [], comments: comments.slice() }], hasMore: false, nextCursor: null }) });
    if (url.pathname === "/api/social/comments/comment-own" && req.method() === "PATCH") {
      comments[0].text = body.text;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ comment: { ...comments[0] } }) });
    }
    if (url.pathname === "/api/social/comments/comment-own" && req.method() === "DELETE") {
      comments.splice(0, 1);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ deleted: true }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await expect(page.getByText("Great session")).toBeVisible();
  await page.locator(".comment").getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Edit your comment").fill("Updated training encouragement");
  await page.locator(".comment-edit").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Updated training encouragement")).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Updated training encouragement")).toHaveCount(0);
  expect(calls.some(call => call.method === "PATCH" && call.path === "/api/social/comments/comment-own" && call.body.text === "Updated training encouragement")).toBeTruthy();
  expect(calls.some(call => call.method === "DELETE" && call.path === "/api/social/comments/comment-own")).toBeTruthy();
});



// Programme generation stays review-first and saved days must use the normal workout start flow.
test("Coach builds a weekly programme, saves it only after review and starts a saved day", async ({ page }) => {
  const saveCalls: any[] = [];
  const movements = [
    { ...exercise, id: "draft-squat", name: "Goblet squat", equipment: "Dumbbell", movementPattern: "Squat", difficulty: "Beginner" },
    { ...exercise, id: "draft-hinge", name: "Romanian deadlift", equipment: "Dumbbell", movementPattern: "Hip hinge", difficulty: "Intermediate" },
    { ...exercise, id: "draft-push", name: "Push-up", equipment: "Bodyweight", movementPattern: "Horizontal push", difficulty: "Beginner" },
    { ...exercise, id: "draft-pull", name: "Single-arm dumbbell row", equipment: "Dumbbell", movementPattern: "Horizontal pull", difficulty: "Beginner" },
    { ...exercise, id: "draft-core", name: "Dead bug", equipment: "Bodyweight", movementPattern: "Anti-extension", difficulty: "Beginner" }
  ];
  await mockApplicationApi(page, undefined, 200, [], movements);
  await page.route("http://localhost:4000/api/workouts/training-plans", async route => {
    if (route.request().method() === "POST") saveCalls.push(route.request().postDataJSON());
    await route.fallback();
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await clickWorkspaceDestination(page, "you", "Plan");
  await expect(page.getByRole("heading", { name: "Build your week." })).toBeVisible();
  const generate = page.getByRole("button", { name: "Generate weekly programme" });
  await expect(generate).toBeEnabled();
  await page.getByLabel("Days available each week").selectOption("2");
  await page.getByLabel("Available equipment").selectOption("dumbbells");
  await generate.click();
  const preview = page.locator(".coach-routine-preview");
  await expect(preview).toContainText("Goblet squat");
  await page.getByLabel("Days available each week").selectOption("4");
  await generate.click();
  await expect(preview.locator(".coach-plan-day")).toHaveCount(4);
  await expect(preview).toContainText("Upper A");
  await expect(preview).toContainText("Lower A");
  await page.getByLabel("Days available each week").selectOption("2");
  await generate.click();
  await expect(preview.locator(".coach-plan-day")).toHaveCount(2);
  await expect(preview).toContainText("Romanian deadlift");
  await expect(preview).toContainText("Push-up");
  await expect(preview).toContainText("Single-arm dumbbell row");
  await expect(preview).toContainText("Dead bug");
  await expect(page.getByRole("heading", { name: "Review your 2-day programme" })).toBeVisible();
  expect(saveCalls).toHaveLength(0);
  await page.getByRole("button", { name: "Save weekly programme" }).click();
  await expect(page.getByText("Weekly programme saved. Choose a day when you're ready to train.")).toBeVisible();
  expect(saveCalls).toHaveLength(1);
  expect(saveCalls[0].days).toHaveLength(2);
  expect(saveCalls[0].days.every((day: any) => day.exercises.length >= 2)).toBeTruthy();
  await expect(page.getByRole("heading", { name: saveCalls[0].name })).toBeVisible();
  await page.getByRole("button", { name: "Start Full body A" }).click();
  await expect(page.getByRole("heading", { name: "Build a workout" })).toBeVisible();
  await expect(page.locator(".exercise-picker input:checked")).toHaveCount(5);
});

// Editing should rebuild a draft for review instead of silently replacing the saved schedule.
test("Coach lets users edit a saved weekly programme and keeps the changes review-first", async ({ page }) => {
  const updateCalls: any[] = [];
  const movements = [
    { ...exercise, id: "draft-squat", name: "Goblet squat", equipment: "Dumbbell", movementPattern: "Squat", difficulty: "Beginner" },
    { ...exercise, id: "draft-hinge", name: "Romanian deadlift", equipment: "Dumbbell", movementPattern: "Hip hinge", difficulty: "Intermediate" },
    { ...exercise, id: "draft-push", name: "Push-up", equipment: "Bodyweight", movementPattern: "Horizontal push", difficulty: "Beginner" },
    { ...exercise, id: "draft-pull", name: "Single-arm dumbbell row", equipment: "Dumbbell", movementPattern: "Horizontal pull", difficulty: "Beginner" },
    { ...exercise, id: "draft-core", name: "Dead bug", equipment: "Bodyweight", movementPattern: "Anti-extension", difficulty: "Beginner" }
  ];
  await mockApplicationApi(page, undefined, 200, [], movements);
  await page.route("http://localhost:4000/api/workouts/training-plans/plan-1", async route => {
    if (route.request().method() === "PUT") updateCalls.push(route.request().postDataJSON());
    await route.fallback();
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Coach" }).click();
  await page.getByLabel("Days available each week").selectOption("2");
  await page.getByLabel("Available equipment").selectOption("dumbbells");
  await page.getByRole("button", { name: "Generate weekly programme" }).click();
  await page.getByRole("button", { name: "Save weekly programme" }).click();
  await expect(page.getByRole("heading", { name: /Coach · General fitness · 2-day programme/ })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit your saved programme" })).toBeVisible();
  await page.getByLabel("Programme name").fill("My updated training week");
  expect(updateCalls).toHaveLength(0);
  await page.getByRole("button", { name: "Save programme changes" }).click();
  await expect(page.getByRole("heading", { name: "My updated training week" })).toBeVisible();
  expect(updateCalls).toHaveLength(1);
  expect(updateCalls[0].name).toBe("My updated training week");
  expect(updateCalls[0].days).toHaveLength(2);
  expect(updateCalls[0].days.every((day: any) => day.exercises.length >= 2)).toBeTruthy();
});



// The weekly view should show training and recovery days across the full calendar week.
test("Coach shows a seven-day recovery-aware layout for saved weekly programmes", async ({ page }) => {
  const movements = [
    { ...exercise, id: "draft-squat", name: "Goblet squat", equipment: "Dumbbell", movementPattern: "Squat", difficulty: "Beginner" },
    { ...exercise, id: "draft-hinge", name: "Romanian deadlift", equipment: "Dumbbell", movementPattern: "Hip hinge", difficulty: "Intermediate" },
    { ...exercise, id: "draft-push", name: "Push-up", equipment: "Bodyweight", movementPattern: "Horizontal push", difficulty: "Beginner" },
    { ...exercise, id: "draft-pull", name: "Single-arm dumbbell row", equipment: "Dumbbell", movementPattern: "Horizontal pull", difficulty: "Beginner" },
    { ...exercise, id: "draft-core", name: "Dead bug", equipment: "Bodyweight", movementPattern: "Anti-extension", difficulty: "Beginner" }
  ];
  await mockApplicationApi(page, undefined, 200, [], movements);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Coach" }).click();
  await page.getByLabel("Days available each week").selectOption("2");
  await page.getByLabel("Available equipment").selectOption("dumbbells");
  await page.getByRole("button", { name: "Generate weekly programme" }).click();
  await page.getByRole("button", { name: "Save weekly programme" }).click();
  const schedule = page.getByLabel(/weekly schedule/);
  await expect(schedule).toBeVisible();
  await expect(schedule.locator(".coach-week-cell")).toHaveCount(7);
  await expect(schedule.locator(".coach-week-cell").nth(0)).toContainText("Day 1");
  await expect(schedule.locator(".coach-week-cell").nth(3)).toContainText("Day 2");
  await expect(schedule.locator(".coach-week-cell").nth(1)).toContainText("Rest");
  await expect(schedule.locator(".coach-week-cell").nth(6)).toContainText("Rest");
});


// Progression advice should expose the recent measurements and rationale behind its suggestion.
test("Coach displays evidence and explanation for workout progression guidance", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Coach" }).click();
  const panel = page.getByRole("region", { name: "Training progression" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Goblet squat")).toBeVisible();
  await expect(panel.getByText("Consider a small increase")).toBeVisible();
  await expect(panel.getByText(/two more reps at the same load/)).toBeVisible();
  await expect(panel.getByText(/Latest: 10 reps at 20 kg · Previous: 8 reps at 20 kg/)).toBeVisible();
});

// Users should be able to distinguish deterministic guidance from an AI-generated response.
test("Coach identifies when a reply uses the guided fallback", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Coach" }).click();
  await page.getByRole("button", { name: "New chat +" }).click();
  await page.getByLabel("Message your coach").fill("Can you help me review my training?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guided reply" })).toBeVisible();
  await expect(page.getByText(/also happens when AI is off or the provider is unavailable/i)).toBeVisible();
});

// AI processing must be disclosed and remain disabled until the account owner explicitly opts in.
test("Coach settings disclose optional AI processing and keep consent off by default", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: /Overview/ })).toBeVisible();

  // Preferences now live in Settings so they do not interrupt the daily Home flow.
  await page.getByRole("button", { name: "Open account settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  const consent = settings.getByLabel(/Use AI-generated coaching replies/);
  await expect(consent).not.toBeChecked();
  await expect(settings.getByText(/message and up to five recent completed workout summaries are sent/i)).toBeVisible();
  await consent.check();
  await settings.getByRole("button", { name: "Save coach preferences" }).click();
  await expect(page.getByText("Your coaching preferences have been saved.")).toBeVisible();
  await expect(consent).toBeChecked();

  // Turning consent off must persist, not merely change the checkbox until the next reload.
  await consent.uncheck();
  await settings.getByRole("button", { name: "Save coach preferences" }).click();
  await expect(page.getByText("Your coaching preferences have been saved.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open account settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" }).getByLabel(/Use AI-generated coaching replies/)).not.toBeChecked();
});


// The overview should offer direct destinations without making users hunt through navigation.
// The Home screen should keep the first useful actions visible before the longer check-in form.
// Account deletion and Coach preferences are important, but they should not lengthen the everyday Home screen.
test("account controls open in a separate settings sheet", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Delete your account" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open account settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Delete your account" })).toBeVisible();
  await expect(settings.getByText("Use AI-generated coaching replies")).toBeVisible();
  await settings.getByRole("button", { name: "Close" }).click();
  await expect(settings).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your week", exact: true })).toBeVisible();
});

test("Home shows a seven-day activity strip without filling unlogged days", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Your week", exact: true })).toBeVisible();
  await expect(page.locator(".week-strip")).toContainText("This week");
  await expect(page.locator(".week-day")).toHaveCount(7);
  // Empty days remain visually unmarked; the strip never implies activity that was not recorded.
  await expect(page.locator(".week-day-markers i.has-workout")).toHaveCount(0);
  await expect(page.locator(".week-day-markers i.has-check-in")).toHaveCount(0);
});

test("overview quick actions open the workout builder and Coach", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Your week", exact: true })).toBeVisible();
  // The overview hero owns its primary action; other screens keep the persistent header shortcut.
  await expect(page.locator(".topbar-action")).toBeHidden();
  await page.getByRole("button", { name: "Start a workout", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Build a workout" })).toBeVisible();
  await expect(page.locator(".topbar-action")).toBeVisible();

  // Return to the overview through the responsive navigation before checking the second shortcut.
  const isMobileLayout = (page.viewportSize()?.width ?? 1280) <= 820;
  const navigation = page.locator(isMobileLayout ? ".mobile-nav" : ".sidebar-nav");
  await navigation.getByRole("button", { name: isMobileLayout ? "Home" : "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Your week", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open coach" }).click();
  await expect(page.locator(".coach-chat-panel")).toBeVisible();
  await expect(page.locator(".topbar strong")).toHaveText("Plan");
});


// Screen ordering keeps the main task visible before secondary account and planning controls.
// Progress owns the weekly totals and daily pattern charts so Home can stay focused on today's next action.
test("Progress is a separate destination with compact weekly metrics", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator(".sidebar-nav button")).toHaveCount(5);
  await page.locator(".sidebar-nav").getByRole("button", { name: "Progress" }).click();
  await expect(page.locator(".sidebar-nav button[aria-current=page]")).toHaveText("Stats");
  await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
  await expect(page.getByText("Workouts this week")).toBeVisible();
  await expect(page.getByText("Sleep, steps, mood and focus")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your week", exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-nav button")).toHaveCount(5);
  await expect(page.locator(".mobile-nav")).toHaveCSS("position", "fixed");
  await page.locator(".mobile-nav").getByRole("button", { name: "Progress" }).click();
  await expect(page.locator(".mobile-nav button[aria-current=page]")).toHaveText("Stats");
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
});

test("Social opens on activity and Plan leads with weekly planning", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await expect(page.getByRole("heading", { name: "Your feed.", exact: true })).toBeVisible();
  await expect(page.getByText("Friend requests, reactions and comments will appear here.")).toBeVisible();
  await expect(page.locator(".community-composer")).toBeVisible();
  await expect(page.locator(".feed-section-heading")).toBeVisible();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Explore" }).click();
  await expect(page.getByRole("heading", { name: "Discover the community" })).toBeVisible();
  await expect(page.locator(".community-composer")).toHaveCount(0);

  await page.locator(".workspace-switch-bar").getByRole("button", { name: "You" }).click();
  await page.locator(".sidebar-nav").getByRole("button", { name: "Coach" }).click();
  await expect(page.getByRole("heading", { name: "Build your week.", exact: true })).toBeVisible();
  await expect(page.locator(".coach-page > .coach-routine-builder")).toHaveCSS("order", "1");
  await expect(page.locator(".coach-page > .coach-chat-layout")).toHaveCSS("order", "3");
  await expect(page.locator(".coach-page > .progression-guidance")).toHaveCSS("order", "2");
  await expect(page.locator(".coach-page > .coach-routine-builder")).toHaveCSS("order", "1");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".coach-page > .coach-chat-layout")).toHaveCSS("order", "3");
  await expect(page.locator(".coach-page .coach-chat-panel")).toHaveCSS("order", "0");
  await expect(page.locator(".coach-page .coach-conversation-list")).toHaveCSS("order", "1");
  await expect(page.locator(".mobile-nav")).toBeVisible();
});

// The activity inbox keeps unread state accurate while older private notifications are appended.
test("Community activity inbox marks items read and paginates older notifications", async ({ page }) => {
  const notifications = Array.from({ length: 21 }, (_, index) => ({
    id: "notification-" + (index + 1),
    type: index % 2 === 0 ? "reaction" : "comment",
    createdAt: new Date(Date.UTC(2026, 10, 8, 12, index)).toISOString(),
    readAt: null,
    actor: { id: "friend-1", username: "friend", displayName: "Friend" },
    post: { id: "post-" + (index + 1), text: "Activity item " + (index + 1), type: "update" }
  }));
  await mockApplicationApi(page, undefined, 200, [], [exercise], undefined, notifications);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();

  const inbox = page.locator(".activity-inbox");
  await expect(inbox.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(inbox.locator(".activity-unread-count")).toHaveText("21");
  await expect(inbox.locator(".activity-notification-list li")).toHaveCount(20);
  await inbox.getByRole("button", { name: "Mark activity from Friend as read" }).first().click();
  await expect(inbox.locator(".activity-unread-count")).toHaveText("20");

  await inbox.getByRole("button", { name: "Load older activity" }).click();
  await expect(inbox.locator(".activity-notification-list li")).toHaveCount(21);
  await expect(inbox.locator(".activity-notification-list li").last()).toContainText("Activity item 21");
  await inbox.getByRole("button", { name: "Mark all read" }).click();
  await expect(inbox.locator(".activity-unread-count")).toHaveCount(0);
  await expect(inbox.locator(".activity-notification-list li.is-unread")).toHaveCount(0);
});

// A temporary failure while paging the inbox must preserve existing items and allow a retry.
test("Community activity inbox preserves loaded notifications when an older page fails", async ({ page }) => {
  const notifications = Array.from({ length: 21 }, (_, index) => ({
    id: "notification-" + (index + 1),
    type: "comment",
    createdAt: new Date(Date.UTC(2026, 10, 8, 12, index)).toISOString(),
    readAt: null,
    actor: { id: "friend-1", username: "friend", displayName: "Friend" },
    post: { id: "post-" + (index + 1), text: "Activity item " + (index + 1), type: "update" }
  }));
  await mockApplicationApi(page, undefined, 200, [], [exercise], undefined, notifications);
  let failNextPage = true;
  await page.route(/\/api\/social\/notifications\?cursor=notification-20$/, async route => {
    if (failNextPage) {
      failNextPage = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Older activity is temporarily unavailable." })
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const inbox = page.locator(".activity-inbox");
  await expect(inbox.locator(".activity-notification-list li")).toHaveCount(20);

  await inbox.getByRole("button", { name: "Load older activity" }).click();
  await expect(inbox.getByRole("alert")).toContainText("Older activity is temporarily unavailable.");
  await expect(inbox.locator(".activity-notification-list li")).toHaveCount(20);

  await inbox.getByRole("button", { name: "Try again" }).click();
  await expect(inbox.locator(".activity-notification-list li")).toHaveCount(21);
  await expect(inbox.getByRole("alert")).toHaveCount(0);
});

// Unread activity remains discoverable from both navigation layouts and clears with inbox actions.
test("Community navigation shows unread activity on desktop and mobile", async ({ page }) => {
  const notifications = [1, 2].map(index => ({
    id: "nav-notification-" + index,
    type: "reaction",
    createdAt: new Date(Date.UTC(2026, 10, 8, 12, index)).toISOString(),
    readAt: null,
    actor: { id: "friend-1", username: "friend", displayName: "Friend" },
    post: { id: "nav-post-" + index, text: "A shared training update", type: "update" }
  }));
  await mockApplicationApi(page, undefined, 200, [], [exercise], undefined, notifications);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const desktopBadge = page.locator(".sidebar-nav .nav-unread-count");
  await expect(desktopBadge).toHaveText("2");
  await expect(page.locator(".sidebar-nav").getByRole("button", { name: "Community, 2 unread notifications" })).toBeVisible();
  const inbox = page.locator(".activity-inbox");
  await expect(inbox.locator(".activity-unread-count")).toHaveText("2");
  await inbox.getByRole("button", { name: "Mark activity from Friend as read" }).first().click();
  await expect(desktopBadge).toHaveText("1");
  await expect(page.locator(".sidebar-nav").getByRole("button", { name: "Community, 1 unread notification" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBadge = page.locator(".mobile-nav .nav-unread-count");
  await expect(mobileBadge).toHaveText("1");
  await expect(page.locator(".mobile-nav").getByRole("button", { name: "Community, 1 unread notification" })).toBeVisible();
  await inbox.getByRole("button", { name: "Mark all read" }).click();
  await expect(mobileBadge).toHaveCount(0);
  await expect(page.locator(".mobile-nav").getByRole("button", { name: "Community", exact: true })).toBeVisible();
});



// Capture the four main destinations at desktop and phone widths so design changes can be reviewed
// against the real React interface instead of relying on descriptions or a separate mock-up.
test("captures current FitLoop screens for visual review", async ({ page }, testInfo) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your week", exact: true })).toBeVisible();

  const desktopNavigation = page.locator(".sidebar-nav");
  const desktopScreens = [
    { name: "overview", ready: page.getByRole("heading", { name: "Your week", exact: true }) },
    { name: "workouts", button: "Workouts", ready: page.getByRole("heading", { name: "Build a workout" }) },
    { name: "community", ready: page.getByRole("heading", { name: "Your feed.", exact: true }) },
    { name: "coach", button: "Coach", ready: page.locator(".coach-chat-panel") }
  ];

  for (const screen of desktopScreens) {
    if (screen.name === "community") await clickWorkspaceDestination(page, "social", "Feed");
    else if (screen.name === "coach") await clickWorkspaceDestination(page, "you", "Plan");
    else if (screen.button) await clickWorkspaceDestination(page, "you", "Workout");
    await expect(screen.ready).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(screen.name + "-desktop.png"), fullPage: true });
  }

  // Capture the four Social destinations separately so the profile and discovery
  // layouts can be reviewed without scrolling through unrelated community tools.
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  const socialDesktop = page.locator(".sidebar-nav");
  for (const destination of ["Feed", "Explore", "Pings", "Profile"]) {
    await socialDesktop.getByRole("button", { name: destination === "Feed" ? "Community" : destination }).click();
    await expect(page.locator(".community-page")).toHaveAttribute("data-social-view", destination.toLowerCase());
    await page.screenshot({ path: testInfo.outputPath(destination.toLowerCase() + "-desktop.png"), fullPage: true });
  }

  // Repeat the same destinations at a common phone size to review the bottom navigation and content flow.
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNavigation = page.locator(".mobile-nav");
  const mobileScreens = [
    { name: "overview", button: "Home", ready: page.getByRole("heading", { name: "Your week", exact: true }) },
    { name: "workouts", button: "Workouts", ready: page.getByRole("heading", { name: "Build a workout" }) },
    { name: "community", button: "Community", ready: page.getByRole("heading", { name: "Your feed.", exact: true }) },
    { name: "coach", button: "Coach", ready: page.locator(".coach-chat-panel") }
  ];

  for (const screen of mobileScreens) {
    if (screen.name === "community") await clickWorkspaceDestination(page, "social", "Feed");
    else if (screen.name === "coach") await clickWorkspaceDestination(page, "you", "Plan");
    else if (screen.name === "overview") await clickWorkspaceDestination(page, "you", "Home");
    else await clickWorkspaceDestination(page, "you", "Workout");
    await expect(screen.ready).toBeVisible();

    // The phone layout must use its own screen hierarchy, not show the desktop workspace bar.
    await expect(page.locator(".app-main > .topbar")).toBeHidden();
    await expect(mobileNavigation).toBeVisible();
    await expect(mobileNavigation).toHaveCSS("position", "fixed");

    // A phone preview should show the actual first viewport, including the tab bar,
    // rather than flattening a long page into a screenshot that no phone user sees.
    const tabBarBounds = await mobileNavigation.boundingBox();
    expect(tabBarBounds).not.toBeNull();
    expect(tabBarBounds!.y + tabBarBounds!.height).toBeLessThanOrEqual(844);
    await page.screenshot({ path: testInfo.outputPath(screen.name + "-mobile.png"), fullPage: false });
  }

  // The Social bar has four equal destinations and should remain usable at phone width.
  for (const destination of ["Feed", "Explore", "Pings", "Profile"]) {
    await clickWorkspaceDestination(page, "social", destination);
    await expect(page.locator(".community-page")).toHaveAttribute("data-social-view", destination.toLowerCase());
    await page.screenshot({ path: testInfo.outputPath(destination.toLowerCase() + "-mobile.png"), fullPage: false });
  }
});


// The two top-level workspaces keep their own focused bottom navigation.
test("Social and You switch between the correct destinations", async ({ page }) => {
  await mockApplicationApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  const workspaceSwitch = page.locator(".workspace-switch-bar");
  await expect(workspaceSwitch.getByRole("button", { name: "You" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".mobile-nav button")).toHaveCount(5);
  await expect(page.locator(".mobile-nav")).toContainText("Home");
  await expect(page.locator(".mobile-nav")).toContainText("Workout");
  await expect(page.locator(".mobile-nav")).toContainText("Stats");
  await expect(page.locator(".mobile-nav")).toContainText("Plan");
  await expect(page.locator(".mobile-nav")).toContainText("Library");
  await page.locator(".mobile-nav").getByRole("button", { name: "Library" }).click();
  await expect(page.locator(".mobile-nav button[aria-current=page]")).toHaveText("Library");
  await page.locator(".mobile-nav").getByRole("button", { name: "Workouts" }).click();
  await expect(page.locator(".mobile-nav button[aria-current=page]")).toHaveText("Workout");

  await workspaceSwitch.getByRole("button", { name: "Social" }).click();
  await expect(workspaceSwitch.getByRole("button", { name: "Social" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".mobile-nav button")).toHaveCount(4);
  await expect(page.locator(".mobile-nav")).toContainText("Feed");
  await expect(page.locator(".mobile-nav")).toContainText("Explore");
  await expect(page.locator(".mobile-nav")).toContainText("Pings");
  await expect(page.locator(".mobile-nav")).toContainText("Profile");

  await clickWorkspaceDestination(page, "social", "Profile");
  await expect(page.getByRole("heading", { name: "Shared workouts & posts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edit profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Blocked accounts" })).toHaveCount(0);

  await clickWorkspaceDestination(page, "social", "Pings");
  await expect(page.getByRole("heading", { name: "Private conversations, done properly." })).toBeVisible();
  await expect(page.getByText(/Private messaging is not available yet/)).toBeVisible();

  await clickWorkspaceDestination(page, "social", "Explore");
  await expect(page.getByRole("heading", { name: "Discover the community" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Find friends" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Friends and requests" })).toBeVisible();

  await workspaceSwitch.getByRole("button", { name: "You" }).click();
  await expect(page.getByRole("heading", { name: "Your week", exact: true })).toBeVisible();
  await expect(page.locator(".mobile-nav button")).toHaveCount(5);
});


// The signed-in profile is built from the same safe post summaries used in the social feed.
test("the member profile shows the signed-in user's own shared workout posts", async ({ page }) => {
  const socialPosts = await mockApplicationApi(page);
  socialPosts.push({
    id: "my-workout-post",
    createdAt: "2026-11-09T10:00:00.000Z",
    text: "A steady session before lectures.",
    type: "workout",
    user: { id: "user-1", username: "tester", displayName: "Test Athlete" },
    session: {
      id: "session-1",
      startedAt: "2026-11-09T09:00:00.000Z",
      routine: { name: "Full body" },
      sets: [{ id: "set-1", reps: 10, weightKg: 20, completed: true, exercise: { id: "exercise-1", name: "Goblet squat" } }]
    },
    reactions: [],
    comments: [],
    _count: { comments: 0 }
  });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator(".workspace-switch-bar").getByRole("button", { name: "Social" }).click();
  await clickWorkspaceDestination(page, "social", "Profile");

  await expect(page.getByRole("heading", { name: "tester", exact: true })).toBeVisible();
  await expect(page.getByText("A steady session before lectures.")).toBeVisible();
  await expect(page.locator(".profile-posts")).toContainText("1 posts");
  await expect(page.locator(".profile-stats")).toContainText("1");
  await expect(page.locator(".profile-stats")).toContainText("Completed sets");
  await expect(page.locator(".profile-posts")).toContainText("10");
  await expect(page.locator(".profile-posts")).toContainText("Goblet squat");
});


// Keep the shared visual tokens from drifting back into the older green dashboard palette.
test("the signed-in app uses the charcoal and orange visual system", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect.poll(() => page.locator("body").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(11, 13, 15)");
  await expect.poll(() => page.locator(".workspace-switch-bar button.active").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 90, 36)");
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(page.locator(".mobile-nav button.active")).toBeVisible();
});


// A responsive app should preserve the same navigation and readable controls
// across common phone widths, not merely avoid a horizontal scrollbar at 320px.
test("Social and You navigation remain usable across phone widths", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.locator(".workspace-switch-bar").getByRole("button", { name: "You" }).click();
  for (const width of [320, 360, 390, 430]) {
    await clickWorkspaceDestination(page, "you", "Home");
    await page.setViewportSize({ width, height: 844 });
    const workspaceSwitch = page.locator(".workspace-switch-bar");
    const bottomNavigation = page.locator(".mobile-nav");

    await expect(workspaceSwitch).toBeVisible();
    await expect(bottomNavigation).toBeVisible();
    await expect(bottomNavigation).toHaveCSS("position", "fixed");
    await expect(bottomNavigation.locator("button")).toHaveCount(5);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const switchBounds = await workspaceSwitch.boundingBox();
    const navigationBounds = await bottomNavigation.boundingBox();
    expect(switchBounds).not.toBeNull();
    expect(navigationBounds).not.toBeNull();
    expect(switchBounds!.width).toBeLessThanOrEqual(width);
    expect(navigationBounds!.width).toBeLessThanOrEqual(width);
    expect(navigationBounds!.y + navigationBounds!.height).toBeLessThanOrEqual(844);

    await clickWorkspaceDestination(page, "social", "Feed");
    await expect(bottomNavigation.locator("button")).toHaveCount(4);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await clickWorkspaceDestination(page, "you", "Home");
  }
});


// Social destinations should show one task at a time. This prevents the phone
// layout from becoming one long page containing every community management tool.
test("Social bottom tabs show their own focused screen content", async ({ page }) => {
  await mockApplicationApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  const nav = page.locator(".mobile-nav");
  await clickWorkspaceDestination(page, "social", "Feed");
  await expect(page.locator(".community-composer")).toBeVisible();
  await expect(page.locator(".activity-inbox")).toBeVisible();
  await expect(page.locator(".feed-section-heading")).toBeVisible();
  await expect(page.locator(".content-grid")).toHaveCount(0);

  await clickWorkspaceDestination(page, "social", "Explore");
  await expect(page.locator(".content-grid")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Find friends" })).toBeVisible();
  await expect(page.locator(".community-composer")).toHaveCount(0);
  await expect(page.locator(".activity-inbox")).toHaveCount(0);
  await expect(page.locator(".feed-section-heading")).toHaveCount(0);

  await clickWorkspaceDestination(page, "social", "Profile");
  await expect(page.locator(".profile-home")).toBeVisible();
  await expect(page.locator(".community-profile-form")).toHaveCount(0);
  await expect(page.locator(".content-grid")).toHaveCount(0);
  await expect(page.locator(".community-composer")).toHaveCount(0);

  await clickWorkspaceDestination(page, "social", "Pings");
  await expect(page.locator(".pings-placeholder")).toBeVisible();
  await expect(page.locator(".profile-home")).toHaveCount(0);
  await expect(page.locator(".content-grid")).toHaveCount(0);
});


test("Explore shows public training discovery separately from friend search", async ({ page }) => {
  await mockApplicationApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await clickWorkspaceDestination(page, "social", "Explore");

  await expect(page.getByRole("heading", { name: "Discover the community" })).toBeVisible();
  await expect(page.getByText("No public posts yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Find friends" })).toBeVisible();
  await expect(page.locator(".community-composer")).toHaveCount(0);
});
