const COLOR_MAP = {
  Silver: '#c7c9cc',
  Black:  '#1c1c1e',
  Red:    '#c0392b',
  White:  '#f4f4f2',
  Blue:   '#2a78d6',
  Gray:   '#7d7f83',
  Grey:   '#7d7f83',
  Yellow: '#eda100',
  Orange: '#eb6834',
  Green:  '#1baf7a',
};

const FALLBACK_COLOR = '#7d7f83';

// A flat, stylized side-profile car — not a photo. Placeholder photo APIs
// (picsum etc.) return random unrelated images; this always renders a
// recognizable car shape in the vehicle's actual listed color, no external
// image dependency or copyright/hotlink risk.
export default function CarIllustration({ color, className = '' }) {
  const body = COLOR_MAP[color] || FALLBACK_COLOR;
  const needsOutline = body === '#f4f4f2';

  return (
    <svg
      viewBox="0 0 400 220"
      className={`car-illustration ${className}`}
      role="img"
      aria-label={`${color || 'Car'} illustration`}
    >
      <defs>
        <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <ellipse cx="200" cy="188" rx="150" ry="12" fill="rgba(0,0,0,0.18)" />

      {/* cabin */}
      <path
        d="M100,120 L132,62 Q142,52 160,52 L252,52 Q270,52 280,62 L316,120 Z"
        fill={body}
        stroke={needsOutline ? 'rgba(0,0,0,0.15)' : 'none'}
      />
      {/* windows */}
      <path
        d="M116,116 L142,68 Q148,60 160,60 L196,60 L196,116 Z"
        fill="#2c3440"
        opacity="0.85"
      />
      <path
        d="M204,60 L246,60 Q256,60 262,68 L288,116 L204,116 Z"
        fill="#2c3440"
        opacity="0.85"
      />
      <rect x="198" y="58" width="4" height="58" fill={body} />

      {/* lower body */}
      <rect x="34" y="118" width="332" height="52" rx="22" fill={body} stroke={needsOutline ? 'rgba(0,0,0,0.15)' : 'none'} />
      <rect x="34" y="118" width="332" height="52" rx="22" fill="url(#sheen)" />

      {/* headlight / taillight */}
      <rect x="336" y="132" width="20" height="12" rx="4" fill="#fff3c4" />
      <rect x="44" y="132" width="16" height="12" rx="4" fill="#c0392b" />

      {/* door seam */}
      <line x1="216" y1="120" x2="216" y2="168" stroke="rgba(0,0,0,0.15)" strokeWidth="2" />

      {/* wheels */}
      <circle cx="112" cy="172" r="30" fill="#1c1c1e" />
      <circle cx="112" cy="172" r="14" fill="#c7c9cc" />
      <circle cx="292" cy="172" r="30" fill="#1c1c1e" />
      <circle cx="292" cy="172" r="14" fill="#c7c9cc" />
    </svg>
  );
}
