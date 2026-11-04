import { expect, test, type Page } from "@playwright/test";

const exercise = {
  id: "exercise-1",
  name: "Goblet squat",
  muscleGroup: "Quadriceps",
  equipment: "Dumbbell",
  movementPattern: "Squat",
  instructions: ["Hold the weight close to your chest.", "Sit between your hips and stand tall."],
  muscles: []
};

async function mockApplicationApi(page: Page, onSessionSave?: (body: any) => void) {
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
    } else if (url.pathname === "/api/workouts/routines") {
      body = method === "GET" ? { routines: [] } : { routine: { id: "routine-1" } };
    } else if (url.pathname === "/api/workouts/sessions") {
      if (method === "POST") {
        onSessionSave?.(request.postDataJSON());
        body = { session: { id: "session-1" } };
      } else {
        body = { sessions: [] };
      }
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
}

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
