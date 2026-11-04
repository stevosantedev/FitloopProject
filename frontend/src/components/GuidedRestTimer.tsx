import { useEffect, useState } from "react";

export type GuidedRestItem = {
  exerciseId: string;
  setId: string;
  label: string;
  setNumber: number;
  reps: string;
  weight: string;
  restSeconds: number;
  completed: boolean;
};

type Props = {
  items: GuidedRestItem[];
  onSetComplete: (exerciseId: string, setId: string) => void;
};

/**
 * Runs a stable snapshot of the workout as a focused training session.
 * The full-screen stage keeps the active set, progress and rest controls
 * visible without exposing the editing form as competing primary content.
 */
export default function GuidedRestTimer({ items, onSetComplete }: Props) {
  const [queue, setQueue] = useState<GuidedRestItem[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<"idle" | "set" | "rest" | "complete">("idle");
  const [message, setMessage] = useState("");
  const current = index === null ? null : queue[index];
  const pendingCount = items.filter(item => !item.completed).length;
  const completedCount = index === null ? (phase === "complete" ? queue.length : 0) : index + (phase === "rest" ? 1 : 0);
  const progress = queue.length ? Math.min(100, (completedCount / queue.length) * 100) : 0;
  const next = index === null ? null : queue[index + 1];

  // Each timeout represents one second. Cleanup prevents an old countdown
  // from advancing the queue after pause, skip, stop or component unmount.
  useEffect(() => {
    if (phase !== "rest" || remaining === null || paused) return;
    const timeout = window.setTimeout(() => {
      if (remaining > 1) {
        setRemaining(value => value === null ? null : value - 1);
        return;
      }
      const nextIndex = index === null ? queue.length : index + 1;
      if (nextIndex >= queue.length) {
        setIndex(null);
        setRemaining(null);
        setPhase("complete");
        setMessage("All guided sets are complete.");
        return;
      }
      setIndex(nextIndex);
      setRemaining(null);
      setPhase("set");
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [phase, remaining, paused, index, queue]);

  function start() {
    const sequence = items.filter(item => !item.completed);
    if (sequence.length === 0) {
      setMessage("All sets are already marked complete.");
      return;
    }
    setQueue(sequence);
    setIndex(0);
    setRemaining(null);
    setPaused(false);
    setPhase("set");
    setMessage("");
  }

  function stop() {
    setQueue([]);
    setIndex(null);
    setRemaining(null);
    setPaused(false);
    setPhase("idle");
    setMessage("Guided workout stopped.");
  }

  function advance() {
    const nextIndex = (index ?? -1) + 1;
    if (nextIndex >= queue.length) {
      setIndex(null);
      setRemaining(null);
      setPhase("complete");
      setMessage("All guided sets are complete.");
      return;
    }
    setIndex(nextIndex);
    setRemaining(null);
    setPhase("set");
  }

  function completeCurrentSet() {
    if (!current) return;
    onSetComplete(current.exerciseId, current.setId);
    if (current.restSeconds > 0) {
      setRemaining(current.restSeconds);
      setPhase("rest");
      setPaused(false);
      return;
    }
    advance();
  }

  function skipRest() {
    setPaused(false);
    advance();
  }

  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <section className="guided-timer" aria-label="Guided workout timer">
      {phase === "idle" && (
        <div className="guided-launcher">
          <div>
            <span className="guided-kicker">TRAINING MODE</span>
            <strong>Ready when you are</strong>
            <p className="chart-note">Follow one set at a time. FitLoop will track completed sets and guide your rest periods.</p>
          </div>
          <button type="button" className="secondary-action" disabled={pendingCount === 0} onClick={start}>Start guided workout</button>
          {message && <p className="chart-note" role="status">{message}</p>}
        </div>
      )}

      {(phase === "set" || phase === "rest") && current && (
        <div className="active-workout" role="region" aria-label="Active workout">
          <div className="active-workout-top">
            <div><span className="guided-kicker">FITLOOP SESSION</span><strong>Workout in progress</strong></div>
            <button type="button" className="small-button active-stop" onClick={stop}>End session</button>
          </div>
          <div className="workout-progress-copy"><span>SESSION PROGRESS</span><strong>{completedCount} / {queue.length} sets</strong></div>
          <div className="workout-progress-track" role="progressbar" aria-label="Workout progress" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={completedCount}><span style={{ width: progress + "%" }} /></div>

          {phase === "set" ? (
            <div className="active-set-stage">
              <span className="active-phase-label">UP NEXT · SET {current.setNumber}</span>
              <h3>{current.label}</h3>
              <div className="active-targets">
                <div><strong>{current.reps}</strong><span>REPS</span></div>
                <div><strong>{current.weight.trim() || "Bodyweight"}</strong><span>LOAD</span></div>
              </div>
              <p className="active-coaching-line">Focus on controlled reps. Confirm the set when you finish.</p>
              <div className="active-primary-actions">
                <button type="button" className="active-complete-button" onClick={completeCurrentSet}>Set complete <span>→</span></button>
                <button type="button" className="small-button" onClick={advance}>Skip set</button>
              </div>
            </div>
          ) : (
            <div className="active-rest-stage">
              <span className="active-phase-label">{paused ? "REST PAUSED" : "RECOVER BEFORE THE NEXT SET"}</span>
              <h3>Take your rest.</h3>
              <p className="rest-countdown active-rest-clock" role="timer" aria-live="off">{clock(remaining ?? 0)}</p>
              <p className="active-rest-caption">Time remaining</p>
              <div className="active-primary-actions">
                <button type="button" className="active-complete-button" onClick={() => setPaused(value => !value)}>{paused ? "Resume rest" : "Pause rest"}</button>
                <button type="button" className="small-button" onClick={skipRest}>Skip rest</button>
              </div>
            </div>
          )}

          <div className="active-workout-footer">
            <span>{current.label} · Set {current.setNumber}</span>
            {next ? <span>Then: {next.label} · Set {next.setNumber}</span> : <span>Final set in this session</span>}
          </div>
        </div>
      )}

      {phase === "complete" && (
        <div className="workout-complete" role="status">
          <span className="completion-mark">✓</span>
          <span className="guided-kicker">SESSION FINISHED</span>
          <h3>Strong work.</h3>
          <p>{message || "All guided sets are complete."}</p>
          <strong>{queue.length} sets completed in guided mode</strong>
          <button type="button" className="secondary-action" onClick={stop}>Back to workout summary</button>
        </div>
      )}
    </section>
  );
}
