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
  expect(workerSource).toContain("fitloop-shell-v1");
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

async function mockApplicationApi(page: Page, onSessionSave?: (body: any) => void, sessionSaveStatus: number | (() => number) = 200) {
  const routines: any[] = [];
  await page.route("http://localhost:4000/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body: unknown = {};

    if (method === "POST" && url.pathname === "/api/auth/login") {
      body = { token: "browser-test-token", user: { id: "user-1", username: "tester" } };
    } else if (url.pathname === "/api/me") {
      body = { user: { id: "user-1", username: "tester" } };
    } else if (url.pathname === "/api/coach/preferences") {
      body = { preference: { style: "gentle", focus: "energy" } };
    } else if (url.pathname === "/api/daily-logs") {
      body = { logs: [] };
    } else if (url.pathname === "/api/coach/history") {
      body = { events: [] };
    } else if (url.pathname === "/api/workouts/exercises") {
      body = { exercises: [exercise] };
    } else if (url.pathname === "/api/workouts/routines" && method === "GET") {
      body = { routines };
    } else if (url.pathname === "/api/workouts/routines" && method === "POST") {
      const input = request.postDataJSON();
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
    } else if (url.pathname === "/api/workouts/personal-records") {
      body = { records: [{
        exerciseId: "exercise-1",
        exerciseName: "Goblet squat",
        heaviestLoad: { value: 32, date: "2026-11-03T18:00:00.000Z", sessionId: "session-pr" },
        mostReps: { value: 12, date: "2026-11-02T18:00:00.000Z", sessionId: "session-pr-old" },
        highestSetVolume: { value: 320, date: "2026-11-03T18:00:00.000Z", sessionId: "session-pr" }
      }] };
    } else if (url.pathname === "/api/workouts/muscle-stats") {
      body = { muscles: [] };
    } else if (url.pathname === "/api/social/friends") {
      body = { connections: [] };
    } else if (url.pathname === "/api/social/feed") {
      body = { posts: [] };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

async function signInAndOpenWorkouts(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Workouts" })).toBeVisible();
  await page.getByRole("button", { name: "Workouts" }).click();
  await expect(page.getByRole("heading", { name: "Build a workout" })).toBeVisible();
  await expect(page.getByText("Goblet squat", { exact: true }).first()).toBeVisible();
  await page.locator(".exercise-choice").filter({ hasText: "Goblet squat" }).locator("input").check();
}

test("personal records show the best completed load, reps and set volume", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await expect(page.getByRole("heading", { name: "Personal records" })).toBeVisible();
  const record = page.locator(".personal-record-card").filter({ hasText: "Goblet squat" });
  await expect(record.getByText("32 kg")).toBeVisible();
  await expect(record.getByText("12 reps")).toBeVisible();
  await expect(record.getByText("320 kg")).toBeVisible();
});

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

test("the workout cannot be saved until at least one set is completed", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await page.getByRole("button", { name: "Save complete session" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Complete at least one set before saving" })).toBeVisible();
});

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

test("the guided rest timer can pause, resume and skip its countdown", async ({ page }) => {
  await mockApplicationApi(page);
  await signInAndOpenWorkouts(page);

  await page.getByRole("button", { name: "Start guided workout" }).click();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Skip rest" }).click();
  await expect(page.getByText("Next set: Goblet squat · Set 2")).toBeVisible();
});

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

test("the app uses persistent navigation on desktop and a bottom tab bar on mobile", async ({ page }) => {
  await mockApplicationApi(page);
  await page.goto("/");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator(".app-sidebar")).toBeVisible();
  await page.getByRole("button", { name: "Workouts" }).click();
  await expect(page.getByRole("heading", { name: "Build a workout" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  const mobileNavButton = page.locator(".mobile-nav button").first();
  await expect.poll(() => mobileNavButton.evaluate(element => getComputedStyle(element).minHeight)).toBe("52px");
  await expect.poll(() => page.locator(".mobile-nav").evaluate(element => getComputedStyle(element).position)).toBe("fixed");
  await page.locator(".mobile-nav").getByRole("button", { name: "Community" }).click();
  await expect(page.getByRole("heading", { name: "Your community." })).toBeVisible();
  await expect(page.locator(".app-sidebar")).toBeHidden();
});

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

test("offline workouts survive a reload and sign-out, then sync for the same account", async ({ page, context }) => {
  let syncCount = 0;
  await mockApplicationApi(page, () => { syncCount += 1; });
  await signInAndOpenWorkouts(page);

  await page.getByLabel("Rest (seconds)").fill("0");
  await page.getByRole("button", { name: "Start guided workout" }).click();
  await page.getByRole("button", { name: "Set complete — start rest" }).click();
  await page.getByRole("button", { name: "End session" }).click();

  await context.setOffline(true);
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

  await context.setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "offline workouts have synced" })).toBeVisible();
  await expect(page.locator(".offline-queue-status")).toHaveCount(0);
  expect(syncCount).toBe(1);
});

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
