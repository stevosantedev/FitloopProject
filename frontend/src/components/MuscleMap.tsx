/**
 * First-party front/back muscle explorer.
 *
 * The illustration is original reference artwork for locating muscle groups,
 * not a medical or clinical anatomy diagram. The named controls remain the
 * accessible selection interface and expose each muscle's training summary.
 */
import MuscleAnatomyIllustration from "./MuscleAnatomyIllustration";

export type MuscleMapItem = {
  id: string;
  slug: string;
  name: string;
  view: string;
  effectiveSets: number;
};

type MuscleMapProps = {
  view: "front" | "back";
  muscles: MuscleMapItem[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
};

export default function MuscleMap({ view, muscles, selectedSlug, onSelect }: MuscleMapProps) {
  // A muscle can appear in both views when it is visible from more than one side.
  const visibleMuscles = muscles.filter(muscle => muscle.view === view || muscle.view === "both");

  return (
    <div className="muscle-map-component">
      <div className="body-diagram">
        <MuscleAnatomyIllustration view={view} selectedSlug={selectedSlug} />
        <p className="chart-note">Original muscle reference artwork. Select a named muscle to view its logged training summary.</p>
      </div>
      <div className="muscle-map-list" role="group" aria-label={view + " muscle selection"}>
        {visibleMuscles.map(muscle => (
          <button
            type="button"
            key={muscle.id}
            className={selectedSlug === muscle.slug ? "muscle-chip selected" : "muscle-chip"}
            aria-label={`${muscle.name}, ${muscle.effectiveSets} effective sets`}
            aria-pressed={selectedSlug === muscle.slug}
            onClick={() => onSelect(muscle.slug)}
          >
            <span>{muscle.name}</span>
            <strong>{muscle.effectiveSets}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
