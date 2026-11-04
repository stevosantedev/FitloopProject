/**
 * First-party front/back muscle explorer.
 *
 * The SVG is an intentionally simplified orientation diagram, not a medical
 * illustration. Selectable muscle names beside it provide the accessible
 * control surface; the highlighted body region is a visual navigation aid.
 */
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

const frontRegions = [
  ["pectoralis-major", "chest"],
  ["anterior-deltoid", "shoulders"],
  ["lateral-deltoid", "shoulders"],
  ["biceps-brachii", "arms"],
  ["brachialis", "arms"],
  ["forearm-flexors", "arms"],
  ["rectus-abdominis", "core"],
  ["obliques", "core"],
  ["quadriceps", "legs"],
  ["adductors", "legs"],
  ["gastrocnemius", "lower-legs"],
  ["soleus", "lower-legs"],
  ["tibialis-anterior", "lower-legs"],
  ["iliopsoas", "hips"],
  ["gluteus-medius", "hips"],
  ["gluteus-minimus", "hips"],
  ["serratus-anterior", "chest"],
  ["rotator-cuff", "shoulders"],
  ["transverse-abdominis", "core"]
] as const;

const backRegions = [
  ["trapezius", "upper-back"],
  ["lower-trapezius", "upper-back"],
  ["rhomboids", "upper-back"],
  ["latissimus-dorsi", "back"],
  ["posterior-deltoid", "shoulders"],
  ["triceps-brachii", "arms"],
  ["forearm-extensors", "arms"],
  ["erector-spinae", "back"],
  ["gluteus-maximus", "hips"],
  ["gluteus-medius", "hips"],
  ["gluteus-minimus", "hips"],
  ["hamstrings", "legs"],
  ["gastrocnemius", "lower-legs"],
  ["soleus", "lower-legs"],
  ["peroneals", "lower-legs"],
  ["rotator-cuff", "shoulders"],
  ["forearm-flexors", "arms"],
  ["levator-scapulae", "upper-back"]
] as const;

export default function MuscleMap({ view, muscles, selectedSlug, onSelect }: MuscleMapProps) {
  // Keep the visual region highlight in step with the selected anatomy record.
  const selectedRegion = [...frontRegions, ...backRegions].find(([slug]) => slug === selectedSlug)?.[1];
  const visibleMuscles = muscles.filter(muscle => muscle.view === view || muscle.view === "both");

  return (
    <div className="muscle-map-component">
      <div className="body-diagram">
        <svg viewBox="0 0 260 470" role="img" aria-label={view === "front" ? "Simplified front body muscle diagram" : "Simplified back body muscle diagram"}>
          <g fill="#405448" stroke="#8ba092" strokeWidth="2" strokeLinejoin="round">
            <circle cx="130" cy="35" r="23" />
            <path d="M111 61 L149 61 L154 82 L176 93 L190 158 L171 181 L165 143 L160 211 L100 211 L95 143 L90 181 L70 158 L84 93 L106 82 Z" />
            <path d="M84 95 L59 105 L35 190 L48 197 L78 133 L96 111 Z" />
            <path d="M176 95 L201 105 L225 190 L212 197 L182 133 L164 111 Z" />
            <path d="M103 208 L157 208 L151 310 L143 310 L139 238 L121 238 L117 310 L109 310 Z" />
            <path d="M109 306 L117 306 L111 431 L94 431 L98 363 Z" />
            <path d="M143 306 L151 306 L162 363 L166 431 L149 431 L143 363 Z" />
          </g>
          {view === "front" ? (
            <g stroke="#172720" strokeWidth="1.5">
              <path className={selectedRegion === "shoulders" ? "body-region active" : "body-region"} d="M91 94 Q105 78 119 91 L111 119 Q94 123 84 109 Z M141 91 Q155 78 169 94 L176 109 Q166 123 149 119 Z" />
              <path className={selectedRegion === "chest" ? "body-region active" : "body-region"} d="M113 105 Q130 97 147 105 L151 143 Q130 153 109 143 Z" />
              <path className={selectedRegion === "arms" ? "body-region active" : "body-region"} d="M83 117 L96 123 L77 184 L63 179 Z M164 123 L177 117 L197 179 L183 184 Z" />
              <path className={selectedRegion === "core" ? "body-region active" : "body-region"} d="M108 150 L152 150 L149 207 L111 207 Z" />
              <path className={selectedRegion === "legs" ? "body-region active" : "body-region"} d="M105 216 L128 216 L122 300 L106 300 Z M132 216 L155 216 L154 300 L138 300 Z" />
              <path className={selectedRegion === "lower-legs" ? "body-region active" : "body-region"} d="M105 312 L117 312 L111 414 L98 414 Z M143 312 L155 312 L162 414 L149 414 Z" />
              <path className={selectedRegion === "hips" ? "body-region active" : "body-region"} d="M105 207 L155 207 L151 239 L109 239 Z" />
            </g>
          ) : (
            <g stroke="#172720" strokeWidth="1.5">
              <path className={selectedRegion === "upper-back" ? "body-region active" : "body-region"} d="M108 88 L152 88 L164 130 L130 153 L96 130 Z" />
              <path className={selectedRegion === "shoulders" ? "body-region active" : "body-region"} d="M91 94 Q105 78 119 91 L111 119 Q94 123 84 109 Z M141 91 Q155 78 169 94 L176 109 Q166 123 149 119 Z" />
              <path className={selectedRegion === "arms" ? "body-region active" : "body-region"} d="M83 117 L96 123 L77 184 L63 179 Z M164 123 L177 117 L197 179 L183 184 Z" />
              <path className={selectedRegion === "back" ? "body-region active" : "body-region"} d="M104 133 L156 133 L150 205 L110 205 Z" />
              <path className={selectedRegion === "hips" ? "body-region active" : "body-region"} d="M105 207 L155 207 L151 245 L109 245 Z" />
              <path className={selectedRegion === "legs" ? "body-region active" : "body-region"} d="M105 242 L128 242 L122 310 L106 310 Z M132 242 L155 242 L154 310 L138 310 Z" />
              <path className={selectedRegion === "lower-legs" ? "body-region active" : "body-region"} d="M105 312 L117 312 L111 414 L98 414 Z M143 312 L155 312 L162 414 L149 414 Z" />
            </g>
          )}
        </svg>
        <p className="chart-note">Simplified body orientation. Use the named controls to select an individual muscle.</p>
      </div>
      <div className="muscle-map-list" aria-label={view + " muscle selection"}>
        {visibleMuscles.map(muscle => (
          <button type="button" key={muscle.id} className={selectedSlug === muscle.slug ? "muscle-chip selected" : "muscle-chip"} onClick={() => onSelect(muscle.slug)}>
            <span>{muscle.name}</span><strong>{muscle.effectiveSets}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
