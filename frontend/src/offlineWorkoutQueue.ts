/**
 * Small IndexedDB queue for completed workout submissions.
 *
 * Only the workout payload and owning account ID are stored. Authentication
 * tokens are never persisted here; a queued session is sent only after its
 * owner signs in again and the API accepts the request.
 */
export type OfflineWorkoutPayload = {
  routineId?: string;
  sets: Array<Record<string, unknown>>;
};

export type QueuedWorkout = {
  id: string;
  userId: string;
  createdAt: string;
  payload: OfflineWorkoutPayload;
};

const DATABASE_NAME = "fitloop-offline";
const DATABASE_VERSION = 1;
const STORE_NAME = "workout-sessions";

  // IndexedDB is optional browser storage, so callers get a rejected promise when unavailable.
function openQueueDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Offline storage is not available in this browser."));
      return;
    }

    // Schema changes belong in the upgrade event; ordinary opens should not recreate the store.
    const opening = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    opening.onupgradeneeded = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error("Could not open offline storage."));
    opening.onblocked = () => reject(new Error("Offline storage is busy in another FitLoop tab."));
  });
}

  // Tag each queued session with its owner so another account cannot replay it after signing in.
export async function queueWorkout(userId: string, payload: OfflineWorkoutPayload, id = crypto.randomUUID()): Promise<QueuedWorkout> {
  const entry: QueuedWorkout = {
    id,
    userId,
    createdAt: new Date().toISOString(),
    payload
  };
  const database = await openQueueDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      // add() prevents a duplicate ID from silently replacing another queued workout.
      // add() prevents a duplicate ID from silently replacing another queued workout.
      transaction.objectStore(STORE_NAME).add(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the workout offline."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline workout save was interrupted."));
    });
  } finally {
    database.close();
  }
  return entry;
}

  // Read only the active account's rows; never expose the full shared-device queue.
export async function getQueuedWorkouts(userId: string): Promise<QueuedWorkout[]> {
  const database = await openQueueDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      // Let IndexedDB apply the owner filter instead of loading every account's data into memory.
      const request = transaction.objectStore(STORE_NAME).index("userId").getAll(userId);
      request.onsuccess = () => {
        const entries = request.result as QueuedWorkout[];
        resolve(entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read offline workouts."));
    });
  } finally {
    database.close();
  }
}

  // Remove after confirmed sync or permanent rejection. Transient failures should remain retryable.
export async function removeQueuedWorkout(id: string): Promise<void> {
  const database = await openQueueDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove the synced workout."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline queue update was interrupted."));
    });
  } finally {
    database.close();
  }
}

  // Cleanup is scoped to one owner, which matters on shared devices and during account deletion.
export async function clearQueuedWorkouts(userId: string): Promise<void> {
  const database = await openQueueDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const userIndex = transaction.objectStore(STORE_NAME).index("userId");
      // Delete through the account index in one read-write transaction. This
      // avoids a read-then-delete gap where a newly queued workout could be
      // missed during account deletion.
      const cursorRequest = userIndex.openKeyCursor(IDBKeyRange.only(userId));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        transaction.objectStore(STORE_NAME).delete(cursor.primaryKey);
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("Could not find this account's offline workouts."));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear this account's offline workouts."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Offline queue cleanup was interrupted."));
    });
  } finally {
    database.close();
  }
}
