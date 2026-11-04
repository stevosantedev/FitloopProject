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

function openQueueDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Offline storage is not available in this browser."));
      return;
    }

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

export async function queueWorkout(userId: string, payload: OfflineWorkoutPayload): Promise<QueuedWorkout> {
  const entry: QueuedWorkout = {
    id: crypto.randomUUID(),
    userId,
    createdAt: new Date().toISOString(),
    payload
  };
  const database = await openQueueDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
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

export async function getQueuedWorkouts(userId: string): Promise<QueuedWorkout[]> {
  const database = await openQueueDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
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
