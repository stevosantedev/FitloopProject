import { useMemo, useState } from "react";

type ExerciseOption = {
  id: string;
  name: string;
  equipment?: string | null;
  movementPattern?: string | null;
  difficulty?: string | null;
};

type Props = {
  exercises: ExerciseOption[];
  onReviewDraft: (name: string, exerciseIds: string[]) => void;
};

type Goal = "general" | "strength" | "muscle";
type Equipment = "bodyweight" | "dumbbells" | "gym";
type Experience = "beginner" | "intermediate" | "experienced";

const movementSlots = [
  { terms: ["squat", "single-leg"] },
  { terms: ["hip hinge", "hip extension", "knee flexion"] },
  { terms: ["horizontal push", "vertical push", "incline push"] },
  { terms: ["horizontal pull", "vertical pull", "horizontal abduction"] },
  { terms: ["anti-extension", "anti-lateral", "anti-rotation", "dynamic core"] }
];

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

export default function CoachRoutineDraft({ exercises, onReviewDraft }: Props) {
  const [goal, setGoal] = useState<Goal>("general");
  const [days, setDays] = useState("3");
  const [equipment, setEquipment] = useState<Equipment>("gym");
  const [experience, setExperience] = useState<Experience>("beginner");
  const [draft, setDraft] = useState<ExerciseOption[]>([]);
  const [generated, setGenerated] = useState(false);

  const eligibleCount = useMemo(
    () => exercises.filter(exercise => equipmentAllowed(exercise, equipment)).length,
    [exercises, equipment]
  );

  function buildDraft() {
    const eligible = exercises.filter(exercise => equipmentAllowed(exercise, equipment));
    const selected: ExerciseOption[] = [];
    for (const slot of movementSlots) {
      const candidates = eligible
        .filter(exercise => !selected.some(item => item.id === exercise.id))
        .filter(exercise => slot.terms.some(term => (exercise.movementPattern ?? "").toLowerCase().includes(term)));
      candidates.sort((a, b) =>
        difficultyScore(a, experience) - difficultyScore(b, experience) ||
        goalScore(a, goal) - goalScore(b, goal) ||
        a.name.localeCompare(b.name)
      );
      if (candidates[0] && difficultyScore(candidates[0], experience) < 8) selected.push(candidates[0]);
    }
    setDraft(selected);
    setGenerated(true);
  }

  const routineName = goal === "strength" ? "Coach draft · Strength" : goal === "muscle" ? "Coach draft · Muscle focus" : "Coach draft · Full body";

  return (
    <section className="panel coach-routine-builder" aria-labelledby="coach-routine-heading">
      <div>
        <p className="eyebrow">TRAINING ASSISTANT</p>
        <h2 id="coach-routine-heading">Build a routine draft</h2>
        <p className="muted">Set your preferences and get a starting session assembled from the FitLoop exercise library. You stay in control of every movement.</p>
      </div>
      <div className="coach-routine-fields">
        <label>Training goal
          <select value={goal} onChange={event => { setGoal(event.target.value as Goal); setGenerated(false); }}>
            <option value="general">General fitness</option><option value="strength">Strength</option><option value="muscle">Muscle building</option>
          </select>
        </label>
        <label>Days available each week
          <select value={days} onChange={event => setDays(event.target.value)}>
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
      <p className="coach-routine-note">This creates one full-body session template, not a complete weekly split. Your {days}-day availability is noted so you can decide how it fits your week.</p>
      <button type="button" className="secondary" onClick={buildDraft} disabled={eligibleCount === 0}>Generate routine draft</button>
      {generated && <div className="coach-routine-preview" aria-live="polite">
        <div className="section-heading-row"><h3>{routineName}</h3><span>{draft.length} movements</span></div>
        {draft.length === 0 ? <p role="status">The current catalogue does not contain enough matching movements for these equipment and experience settings. Try a broader equipment choice.</p> : <>
          <ol>{draft.map((exercise, index) => <li key={exercise.id}><strong>{index + 1}. {exercise.name}</strong><span>{exercise.movementPattern} · {exercise.equipment ?? "Equipment varies"}</span></li>)}</ol>
          <p className="muted">Suggested starting point only: review exercise technique, choose appropriate loads and adjust the session to your needs.</p>
          <button type="button" onClick={() => onReviewDraft(routineName, draft.map(exercise => exercise.id))}>Review in routine editor</button>
        </>}
      </div>}
      <p className="coach-routine-disclosure">This is a transparent catalogue-based draft, not a generative AI recommendation or medical assessment. Nothing is saved until you review the movements in the routine editor and choose Save routine.</p>
    </section>
  );
}
