import { useEffect, useState } from "react";

export type GuidedRestItem = {
  exerciseId: string;
  label: string;
  setNumber: number;
  reps: string;
  weight: string;
  restSeconds: number;
  completed: boolean;
};

type Props = {
  items: GuidedRestItem[];
  onSetComplete: (exerciseId: string, setNumber: number) => void;
};

/**
 * Guides a workout one set at a time. The user confirms when a set is finished;
 * the component then runs that exercise's rest period and advances to the next
 * pending set. The queue is snapshotted at start so editing the builder while a
 * timer is active cannot reorder the sequence underneath the current countdown.
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

  // A timeout chain cleans itself up on pause, skip, stop and unmount.
  // Finishing a rest period advances to the next set rather than starting its
  // rest timer immediately; the user performs that set before starting a rest.
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
    onSetComplete(current.exerciseId, current.setNumber);
    if (index === queue.length - 1) {
      setIndex(null);
      setRemaining(null);
      setPhase("complete");
      setMessage("All guided sets are complete.");
      return;
    }
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

  return (
    <section className="guided-timer" aria-label="Guided workout timer">
      <div>
        <strong>Guided workout</strong>
        <p className="chart-note">Work through each pending set. Confirm a set when you finish to start its rest period.</p>
      </div>
      {phase === "idle" && (
        <>
          <button type="button" className="secondary-action" disabled={pendingCount === 0} onClick={start}>Start guided workout</button>
          {message && <p className="chart-note" role="status">{message}</p>}
        </>
      )}
      {phase === "set" && current && (
        <>
          <p className="guided-timer-current">Next set: {current.label} · Set {current.setNumber}</p>
          <p className="chart-note">Target: {current.reps} reps · Load: {current.weight.trim() || "Bodyweight / not set"}</p>
          <div className="guided-timer-actions">
            <button type="button" className="secondary-action" onClick={completeCurrentSet}>Set complete — start rest</button>
            <button type="button" className="small-button" onClick={advance}>Skip set</button>
            <button type="button" className="small-button" onClick={stop}>Stop workout</button>
          </div>
        </>
      )}
      {phase === "rest" && current && (
        <>
          <p className="guided-timer-current">Rest after {current.label} · Set {current.setNumber}</p>
          <p className="rest-countdown" role="timer" aria-live="off">
            {Math.floor((remaining ?? 0) / 60)}:{String((remaining ?? 0) % 60).padStart(2, "0")} remaining
          </p>
          <div className="guided-timer-actions">
            <button type="button" className="small-button" onClick={() => setPaused(value => !value)}>{paused ? "Resume" : "Pause"}</button>
            <button type="button" className="small-button" onClick={skipRest}>Skip rest</button>
            <button type="button" className="small-button" onClick={stop}>Stop workout</button>
          </div>
        </>
      )}
      {phase === "complete" && (
        <p className="chart-note" role="status">{message || "All guided sets are complete."}</p>
      )}
    </section>
  );
}
