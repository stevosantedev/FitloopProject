import { useEffect, useMemo, useState } from "react";

export type GuidedRestItem = {
  label: string;
  setNumber: number;
  restSeconds: number;
};

type Props = { items: GuidedRestItem[] };

/**
 * Runs a rest countdown through the completed set rows supplied by the workout
 * builder. Keeping timer state in this component means the workout form remains
 * focused on editing set data and the timer owns its own pause/skip lifecycle.
 */
export default function GuidedRestTimer({ items }: Props) {
  const [queue, setQueue] = useState<GuidedRestItem[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const current = index === null ? null : queue[index];

  // Do not restart a running sequence when the parent creates a new array on
  // render. A sequence is snapshotted only when the user presses Start.
  const availableCount = useMemo(() => items.length, [items.length]);

  useEffect(() => {
    if (remaining === null || paused) return;
    const timeout = window.setTimeout(() => {
      if (remaining > 1) {
        setRemaining(value => value === null ? null : value - 1);
        return;
      }
      const nextIndex = index === null ? queue.length : index + 1;
      if (nextIndex >= queue.length) {
        setRemaining(null);
        setIndex(null);
        setQueue([]);
        return;
      }
      setIndex(nextIndex);
      setRemaining(queue[nextIndex].restSeconds);
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [remaining, paused, index, queue]);

  function start() {
    // The last completed set has no following rest period, so it is not added.
    const sequence = items.slice(0, -1).filter(item => item.restSeconds > 0);
    if (sequence.length === 0) return;
    setQueue(sequence);
    setIndex(0);
    setRemaining(sequence[0].restSeconds);
    setPaused(false);
  }

  function stop() {
    setQueue([]);
    setIndex(null);
    setRemaining(null);
    setPaused(false);
  }

  function skip() {
    if (index === null || index + 1 >= queue.length) {
      stop();
      return;
    }
    const next = index + 1;
    setIndex(next);
    setRemaining(queue[next].restSeconds);
  }

  return (
    <section className="guided-timer" aria-label="Guided rest timer">
      <div>
        <strong>Guided rest timer</strong>
        <p className="chart-note">Runs between completed sets in exercise order. The final set is skipped.</p>
      </div>
      {current ? (
        <>
          <p className="guided-timer-current">Rest after {current.label} · Set {current.setNumber}</p>
          <p className="rest-countdown" role="timer" aria-live="off">
            {Math.floor((remaining ?? 0) / 60)}:{String((remaining ?? 0) % 60).padStart(2, "0")} remaining
          </p>
          <p className="chart-note">Rest {index! + 1} of {queue.length}</p>
          <div className="guided-timer-actions">
            <button type="button" className="small-button" onClick={() => setPaused(value => !value)}>{paused ? "Resume" : "Pause"}</button>
            <button type="button" className="small-button" onClick={skip}>Skip rest</button>
            <button type="button" className="small-button" onClick={stop}>Stop sequence</button>
          </div>
        </>
      ) : (
        <button type="button" className="secondary-action" disabled={availableCount < 2} onClick={start}>Begin guided rest sequence</button>
      )}
    </section>
  );
}
