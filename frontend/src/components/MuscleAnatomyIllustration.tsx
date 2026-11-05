type Props = { view: "front" | "back"; selectedSlug: string };

/**
 * Original vector muscle reference used for navigation, not clinical education.
 * Muscle groups are drawn as separate selectable shapes over a neutral body
 * silhouette so the selected record is easier to locate than on a single
 * highlighted torso/limb region.
 */
export default function MuscleAnatomyIllustration({ view, selectedSlug }: Props) {
  const shape = (slug: string, path: string, key: string) => (
    <path key={key} className={selectedSlug === slug ? "muscle-shape active" : "muscle-shape"} d={path} />
  );

  const front = [
    ["anterior-deltoid", "M91 94 Q105 82 119 96 L113 123 Q98 130 86 113 Z M141 96 Q155 82 169 94 L174 113 Q162 130 147 123 Z"],
    ["lateral-deltoid", "M82 104 Q90 91 101 96 L96 126 L84 132 L76 118 Z M159 96 Q170 91 178 104 L184 118 L176 132 L164 126 Z"],
    ["pectoralis-major", "M111 111 Q130 101 149 111 L153 144 Q132 153 107 144 Z"],
    ["serratus-anterior", "M104 139 L112 147 L108 169 L99 160 Z M148 147 L156 139 L161 160 L152 169 Z"],
    ["biceps-brachii", "M83 128 Q95 126 99 139 L91 175 L78 177 L76 151 Z M161 139 Q165 126 177 128 L184 151 L182 177 L169 175 Z"],
    ["brachialis", "M79 158 L91 159 L87 185 L76 184 Z M169 159 L181 158 L184 184 L173 185 Z"],
    ["forearm-flexors", "M75 187 L88 188 L77 235 L65 231 Z M172 188 L185 187 L195 231 L183 235 Z"],
    ["rectus-abdominis", "M113 151 L147 151 L145 204 L115 204 Z"],
    ["obliques", "M104 151 L113 155 L110 198 L101 190 Z M147 155 L156 151 L159 190 L150 198 Z"],
    ["transverse-abdominis", "M114 181 L146 181 L145 205 L115 205 Z"],
    ["quadriceps", "M105 220 L127 220 L123 293 L108 303 L100 270 Z M133 220 L155 220 L160 270 L152 303 L137 293 Z"],
    ["adductors", "M124 223 L136 223 L133 280 L126 280 Z"],
    ["iliopsoas", "M110 207 L126 214 L120 238 L108 230 Z M134 214 L150 207 L152 230 L140 238 Z"],
    ["gluteus-minimus", "M102 208 Q110 199 121 205 L117 225 L105 229 Z M139 205 Q150 199 158 208 L155 229 L143 225 Z"],
    ["tibialis-anterior", "M106 310 L118 309 L112 402 L101 402 Z M142 309 L154 310 L159 402 L148 402 Z"],
    ["gastrocnemius", "M105 317 L116 317 L114 357 L103 359 Z M144 317 L155 317 L157 359 L146 357 Z"],
    ["soleus", "M105 358 L115 358 L112 397 L103 397 Z M145 358 L155 358 L157 397 L148 397 Z"]
  ] as const;

  const back = [
    ["trapezius", "M111 87 L149 87 L162 128 L130 155 L98 128 Z"],
    ["lower-trapezius", "M119 129 L141 129 L130 178 Z"],
    ["posterior-deltoid", "M89 96 Q104 83 119 98 L112 127 L94 131 L83 114 Z M141 98 Q156 83 171 96 L177 114 L166 131 L148 127 Z"],
    ["triceps-brachii", "M82 128 L96 126 L99 174 L84 180 L76 151 Z M164 126 L178 128 L184 151 L176 180 L161 174 Z"],
    ["forearm-extensors", "M76 185 L90 184 L79 233 L65 231 Z M170 184 L184 185 L195 231 L181 233 Z"],
    ["rhomboids", "M111 123 L130 137 L149 123 L145 161 L130 173 L115 161 Z"],
    ["latissimus-dorsi", "M102 137 L119 145 L116 199 L101 188 L94 158 Z M141 145 L158 137 L166 158 L159 188 L144 199 Z"],
    ["erector-spinae", "M123 150 L129 150 L127 207 L120 207 Z M131 150 L137 150 L140 207 L133 207 Z"],
    ["gluteus-maximus", "M104 211 Q130 198 156 211 L153 246 Q130 259 107 246 Z"],
    ["gluteus-medius", "M103 205 Q111 196 124 202 L120 222 L105 226 Z M136 202 Q149 196 157 205 L155 226 L140 222 Z"],
    ["gluteus-minimus", "M105 211 Q113 205 122 211 L118 231 L107 233 Z M138 211 Q147 205 155 211 L153 233 L142 231 Z"],
    ["hamstrings", "M105 250 L127 250 L122 312 L107 307 Z M133 250 L155 250 L153 307 L138 312 Z"],
    ["gastrocnemius", "M103 318 Q114 309 121 322 L116 367 L104 370 Z M139 322 Q146 309 157 318 L156 370 L144 367 Z"],
    ["soleus", "M106 368 L117 365 L113 405 L103 405 Z M143 365 L154 368 L157 405 L147 405 Z"],
    ["peroneals", "M96 330 L104 332 L101 397 L94 397 Z M156 332 L164 330 L166 397 L159 397 Z"],
    ["levator-scapulae", "M112 86 L122 91 L117 118 L108 112 Z M138 91 L148 86 L152 112 L143 118 Z"],
    ["rotator-cuff", "M95 113 L106 108 L111 128 L100 135 Z M154 108 L165 113 L160 135 L149 128 Z"]
  ] as const;

  const muscles = view === "front" ? front : back;
  return (
    <svg viewBox="0 0 260 440" aria-hidden="true" focusable="false">
      <g className="body-silhouette" strokeLinejoin="round">
        <circle cx="130" cy="34" r="22" />
        <path d="M113 58 L147 58 L153 78 L176 88 L190 155 L174 177 L163 137 L158 211 L102 211 L97 137 L86 177 L70 155 L84 88 L107 78 Z" />
        <path d="M84 91 L60 103 L35 190 L49 198 L78 135 L97 111 Z M176 91 L200 103 L225 190 L211 198 L182 135 L163 111 Z" />
        <path d="M104 207 L128 207 L122 309 L106 309 Z M132 207 L156 207 L154 309 L138 309 Z" />
        <path d="M106 306 L119 306 L113 420 L96 420 Z M141 306 L154 306 L164 420 L147 420 Z" />
      </g>
      <g className="muscle-layer">
        {muscles.map(([slug, path], index) => shape(slug, path, slug + "-" + index))}
      </g>
      <g className="anatomy-centre-lines" aria-hidden="true">
        <path d="M130 60 L130 208 M130 211 L130 420" />
      </g>
    </svg>
  );
}
