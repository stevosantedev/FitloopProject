import { useMemo, useState } from "react";

export type ExerciseOption = {
  id: string;
  name: string;
  equipment?: string | null;
  movementPattern?: string | null;
  difficulty?: string | null;
};

type Goal = "general" | "strength" | "muscle";
type Equipment = "bodyweight" | "dumbbells" | "gym";
type Experience = "beginner" | "intermediate" | "experienced";
type Movement = "squat" | "hinge" | "horizontalPush" | "verticalPush" | "horizontalPull" | "verticalPull" | "kneeFlexion" | "core";

export type CoachPlanInput = {
  name: string;
  goal: Goal;
  daysPerWeek: number;
  experience: Experience;
  equipment: Equipment;
  days: Array<{
    dayNumber: number;
    label: string;
    routineName: string;
    exercises: Array<{ exerciseId: string; sortOrder: number }>;
  }>;
};

export type TrainingPlanView = {
  id: string;
  name: string;
  goal: Goal;
  daysPerWeek: number;
  experience: Experience;
  equipment: Equipment;
  days: Array<{
    id: string;
    dayNumber: number;
    label: string;
    routine: {
      id: string;
      name: string;
      exercises: Array<{ exercise: ExerciseOption }>;
    };
  }>;
};

type Props = {
  exercises: ExerciseOption[];
  plans: TrainingPlanView[];
  plansLoading: boolean;
  saving: boolean;
  onSavePlan: (input: CoachPlanInput) => Promise<void>;
  onUpdatePlan: (planId: string, input: CoachPlanInput) => Promise<void>;
  onDeletePlan: (planId: string) => void;
  onStartDay: (routine: TrainingPlanView["days"][number]["routine"]) => void;
};

type DraftDay = { dayNumber: number; label: string; movements: Movement[]; exercises: ExerciseOption[] };

const movementTerms: Record<Movement, string[]> = {
  squat: ["squat", "single-leg"],
  hinge: ["hip hinge", "hip extension"],
  horizontalPush: ["horizontal push", "incline push"],
  verticalPush: ["vertical push"],
  horizontalPull: ["horizontal pull", "horizontal abduction"],
  verticalPull: ["vertical pull"],
  kneeFlexion: ["knee flexion"],
  core: ["anti-extension", "anti-lateral", "anti-rotation", "dynamic core", "core"]
};
const fullBody: Movement[] = ["squat", "hinge", "horizontalPush", "verticalPush", "horizontalPull", "verticalPull", "core"];

function splitFor(days: number): Array<{ label: string; movements: Movement[] }> {
  if (days === 2) return [{ label: "Full body A", movements: fullBody }, { label: "Full body B", movements: fullBody }];
  if (days === 3) return [1, 2, 3].map(number => ({ label: "Full body " + String.fromCharCode(64 + number), movements: fullBody }));
  if (days === 4) return [
    { label: "Upper A", movements: ["horizontalPush", "verticalPush", "horizontalPull", "verticalPull", "core"] },
    { label: "Lower A", movements: ["squat", "hinge", "kneeFlexion", "core"] },
    { label: "Upper B", movements: ["horizontalPush", "verticalPush", "horizontalPull", "verticalPull", "core"] },
    { label: "Lower B", movements: ["squat", "hinge", "kneeFlexion", "core"] }
  ];
  if (days === 5) return [
    { label: "Push", movements: ["horizontalPush", "verticalPush", "core"] },
    { label: "Pull", movements: ["horizontalPull", "verticalPull", "core"] },
    { label: "Legs", movements: ["squat", "hinge", "kneeFlexion", "core"] },
    { label: "Upper", movements: ["horizontalPush", "verticalPush", "horizontalPull", "verticalPull", "core"] },
    { label: "Lower", movements: ["squat", "hinge", "kneeFlexion", "core"] }
  ];
  return [
    { label: "Push A", movements: ["horizontalPush", "verticalPush", "core"] },
    { label: "Pull A", movements: ["horizontalPull", "verticalPull", "core"] },
    { label: "Legs A", movements: ["squat", "hinge", "kneeFlexion", "core"] },
    { label: "Push B", movements: ["horizontalPush", "verticalPush", "core"] },
    { label: "Pull B", movements: ["horizontalPull", "verticalPull", "core"] },
    { label: "Legs B", movements: ["squat", "hinge", "kneeFlexion", "core"] }
  ];
}

function equipmentAllowed(exercise: ExerciseOption, equipment: Equipment) {
  const value = (exercise.equipment ?? "").toLowerCase();
  if (equipment === "gym") return true;
  if (equipment === "bodyweight") return value === "bodyweight";
  return ["bodyweight", "dumbbell", "bench"].includes(value);
}

function difficultyScore(exercise: ExerciseOption, experience: Experience) {
  const difficulty = (exercise.difficulty ?? "beginner").toLowerCase();
  if (experience === "beginner") return difficulty === "beginner" ? 0 : difficulty === "intermediate" ? 2 : 8;
  if (experience === "intermediate") return difficulty === "intermediate" ? 0 : difficulty === "beginner" ? 1 : 3;
  return difficulty === "advanced" ? 0 : difficulty === "intermediate" ? 1 : 2;
}

function goalScore(exercise: ExerciseOption, goal: Goal) {
  const equipment = (exercise.equipment ?? "").toLowerCase();
  if (goal === "strength") return equipment === "barbell" ? 0 : equipment === "machine" ? 1 : 2;
  if (goal === "muscle") return ["dumbbell", "machine", "cable"].includes(equipment) ? 0 : 1;
  return 0;
}

function matchesMovement(exercise: ExerciseOption, movement: Movement) {
  const pattern = (exercise.movementPattern ?? "").toLowerCase();
  return movementTerms[movement].some(term => pattern.includes(term));
}

export default function CoachRoutineDraft({ exercises, plans, plansLoading, saving, onSavePlan, onUpdatePlan, onDeletePlan, onStartDay }: Props) {
  const [goal, setGoal] = useState<Goal>("general");
  const [days, setDays] = useState("3");
  const [equipment, setEquipment] = useState<Equipment>("gym");
  const [experience, setExperience] = useState<Experience>("beginner");
  const [planName, setPlanName] = useState("");
  const [draft, setDraft] = useState<DraftDay[]>([]);
  const [generated, setGenerated] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const eligible = useMemo(
    () => exercises.filter(exercise => equipmentAllowed(exercise, equipment) && difficultyScore(exercise, experience) < 8),
    [exercises, equipment, experience]
  );

  function buildDraft() {
    const used = new Set<string>();
    const nextDraft = splitFor(Number(days)).map((template, index) => {
      const selected: ExerciseOption[] = [];
      for (const movement of template.movements) {
        const candidates = eligible
          .filter(exercise => !selected.some(item => item.id === exercise.id))
          .filter(exercise => matchesMovement(exercise, movement));
        candidates.sort((a, b) =>
          Number(used.has(a.id)) - Number(used.has(b.id)) ||
          difficultyScore(a, experience) - difficultyScore(b, experience) ||
          goalScore(a, goal) - goalScore(b, goal) ||
          a.name.localeCompare(b.name)
        );
        if (candidates[0]) {
          selected.push(candidates[0]);
          used.add(candidates[0].id);
        }
      }
      return { dayNumber: index + 1, label: template.label, movements: template.movements, exercises: selected };
    });
    setDraft(nextDraft);
    setPlanName("Coach · " + (goal === "general" ? "General fitness" : goal === "strength" ? "Strength" : "Muscle building") + " · " + days + "-day programme");
    setGenerated(true);
  }

  function toggleExercise(dayNumber: number, exercise: ExerciseOption, checked: boolean) {
    setDraft(current => current.map(day => {
      if (day.dayNumber !== dayNumber) return day;
      const next = checked ? [...day.exercises, exercise] : day.exercises.filter(item => item.id !== exercise.id);
      return { ...day, exercises: next };
    }));
  }

  async function saveDraft() {
    setSaveError("");
    const input: CoachPlanInput = {
      name: planName.trim(), goal, daysPerWeek: Number(days), experience, equipment,
      days: draft.map(day => ({
        dayNumber: day.dayNumber,
        label: day.label,
        routineName: planName.trim() + " · " + day.label,
        exercises: day.exercises.map((exercise, sortOrder) => ({ exerciseId: exercise.id, sortOrder }))
      }))
    };
    try {
      if (editingPlanId) await onUpdatePlan(editingPlanId, input);
      else await onSavePlan(input);
      setGenerated(false);
      setDraft([]);
      setEditingPlanId(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this programme. Your review is still here.");
    }
  }

  function editSavedPlan(plan: TrainingPlanView) {
    const movementOptions: Movement[] = ["squat", "hinge", "horizontalPush", "verticalPush", "horizontalPull", "verticalPull", "kneeFlexion", "core"];
    setGoal(plan.goal);
    setDays(String(plan.daysPerWeek));
    setEquipment(plan.equipment);
    setExperience(plan.experience);
    setPlanName(plan.name);
    setDraft(plan.days.map(day => {
      const selected = day.routine.exercises.map(item => item.exercise);
      const movements = movementOptions.filter(movement => selected.some(exercise => matchesMovement(exercise, movement)));
      return {
        dayNumber: day.dayNumber,
        label: day.label,
        movements: movements.length ? movements : fullBody,
        exercises: selected
      };
    }));
    setEditingPlanId(plan.id);
    setSaveError("");
    setGenerated(true);
  }

  return (
    <section className="panel coach-routine-builder" aria-labelledby="coach-routine-heading">
      <div>
        <p className="eyebrow">TRAINING ASSISTANT</p>
        <h2 id="coach-routine-heading">Build a weekly programme</h2>
        <p className="muted">Choose how often you can train and get a starting weekly structure assembled from the FitLoop exercise library. Review every day before saving.</p>
      </div>
      <div className="coach-routine-fields">
        <label>Training goal
          <select value={goal} onChange={event => { setGoal(event.target.value as Goal); setGenerated(false); }}>
            <option value="general">General fitness</option><option value="strength">Strength</option><option value="muscle">Muscle building</option>
          </select>
        </label>
        <label>Days available each week
          <select value={days} onChange={event => { setDays(event.target.value); setGenerated(false); }}>
            <option value="2">2 days</option><option value="3">3 days</option><option value="4">4 days</option><option value="5">5 days</option><option value="6">6 days</option>
          </select>
        </label>
        <label>Available equipment
          <select value={equipment} onChange={event => { setEquipment(event.target.value as Equipment); setGenerated(false); }}>
            <option value="bodyweight">Bodyweight only</option><option value="dumbbells">Dumbbells and bodyweight</option><option value="gym">Full gym</option>
          </select>
        </label>
        <label>Training experience
          <select value={experience} onChange={event => { setExperience(event.target.value as Experience); setGenerated(false); }}>
            <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="experienced">Experienced</option>
          </select>
        </label>
      </div>
      <p className="coach-routine-note">The draft uses a full-body structure for 2–3 days, upper/lower for 4 days, and a push/pull/legs-based split for 5–6 days. It is a starting layout, not a personalised clinical prescription.</p>
      <button type="button" className="secondary" onClick={() => { setEditingPlanId(null); setSaveError(""); buildDraft(); }} disabled={eligible.length === 0}>Generate weekly programme</button>
      {generated && <div className="coach-routine-preview" aria-live="polite">
        <label className="coach-plan-name">Programme name<input value={planName} onChange={event => setPlanName(event.target.value)} maxLength={80} /></label>
        <div className="section-heading-row"><h3>{editingPlanId ? "Edit your saved programme" : "Review your " + days + "-day programme"}</h3><span>{draft.reduce((total, day) => total + day.exercises.length, 0)} movement slots filled</span></div>
        <div className="coach-plan-day-grid">
          {draft.map(day => <article className="coach-plan-day" key={day.dayNumber}>
            <div className="section-heading-row"><h4>Day {day.dayNumber} · {day.label}</h4><span>{day.exercises.length} movements</span></div>
            {day.exercises.length === 0 ? <p className="muted">No matching movements found for this day. Try different equipment.</p> : <ol>{day.exercises.map(exercise => <li key={exercise.id}><strong>{exercise.name}</strong><span>{exercise.movementPattern ?? "Movement"} · {exercise.equipment ?? "Equipment varies"}</span></li>)}</ol>}
            <details className="coach-plan-adjustments">
              <summary>Add or remove movements</summary>
              <div className="coach-plan-adjustment-list">
                {eligible.filter(exercise => day.movements.some(movement => matchesMovement(exercise, movement))).map(exercise => <label key={exercise.id}>
                  <input type="checkbox" aria-label={"Day " + day.dayNumber + ": " + exercise.name} checked={day.exercises.some(item => item.id === exercise.id)} onChange={event => toggleExercise(day.dayNumber, exercise, event.target.checked)} />
                  <span>{exercise.name}</span>
                </label>)}
              </div>
            </details>
          </article>)}
        </div>
        <p className="muted">Review the exercise choices, technique and training load before starting. You can remove or add matching movements to each day.</p>
        {saveError && <p className="load-error" role="alert">{saveError}</p>}
        <button type="button" onClick={() => void saveDraft()} disabled={saving || !planName.trim() || draft.some(day => day.exercises.length < 2)}>
          {saving ? "Saving programme…" : editingPlanId ? "Save programme changes" : "Save weekly programme"}
        </button>
        {draft.some(day => day.exercises.length < 2) && <p role="status">Each training day needs at least two selected movements before this programme can be saved.</p>}
      </div>}
      <div className="coach-saved-plans">
        <div className="section-heading-row"><h3>Your programmes</h3><span>{plans.length} saved</span></div>
        {plansLoading ? <p className="muted" role="status">Loading your programmes…</p> : plans.length === 0 ? <p className="muted">Your saved weekly programmes will appear here.</p> : plans.map(plan => <article className="coach-saved-plan" key={plan.id}>
          <div className="section-heading-row"><div><h4>{plan.name}</h4><p className="muted">{plan.daysPerWeek} days · {plan.goal} · {plan.experience}</p></div><div className="button-row"><button type="button" className="small-button secondary" onClick={() => editSavedPlan(plan)}>Edit</button><button type="button" className="small-button" onClick={() => onDeletePlan(plan.id)}>Delete</button></div></div>
          <div className="coach-saved-plan-days">{plan.days.map(day => <div key={day.id}>
            <div><strong>Day {day.dayNumber} · {day.label}</strong><small>{day.routine.exercises.length} movements</small></div>
            <button type="button" className="secondary small-button" onClick={() => onStartDay(day.routine)}>Start {day.label}</button>
          </div>)}</div>
        </article>)}
      </div>
      {generated && editingPlanId && <button type="button" className="secondary" onClick={() => { setGenerated(false); setDraft([]); setEditingPlanId(null); setSaveError(""); }}>Cancel editing</button>}
      <p className="coach-routine-disclosure">This programme is assembled from catalogue movement patterns and your selected preferences. It is not a generative AI recommendation or medical assessment. The Coach does not know your injuries, recovery needs or clinical history; adjust the programme to your circumstances.</p>
    </section>
  );
}
