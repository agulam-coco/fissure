/** The Fissure mark (same art as the favicon), inlined so it stays crisp at any size. */
export default function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="logo-mark"
    >
      <defs>
        <radialGradient id="fl-bg" cx="0.5" cy="0.42" r="0.75">
          <stop offset="0" stopColor="#3a1428" />
          <stop offset="0.55" stopColor="#170c1e" />
          <stop offset="1" stopColor="#08070a" />
        </radialGradient>
        <linearGradient id="fl-cone" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6e3f73" />
          <stop offset="0.5" stopColor="#4c2a54" />
          <stop offset="1" stopColor="#1c0f24" />
        </linearGradient>
        <radialGradient id="fl-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb245" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#ff5a1f" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fl-burst" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff1d6" />
          <stop offset="0.45" stopColor="#ffb245" />
          <stop offset="1" stopColor="#ff5a1f" />
        </linearGradient>
        <filter id="fl-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <clipPath id="fl-tile">
          <rect width="64" height="64" rx="14" />
        </clipPath>
      </defs>
      <g clipPath="url(#fl-tile)">
        <rect width="64" height="64" fill="url(#fl-bg)" />
        <circle cx="32" cy="23" r="20" fill="url(#fl-glow)" className="logo-glow" />
        <circle cx="27.5" cy="15" r="5" fill="#ff5a1f" />
        <circle cx="37" cy="13.5" r="5.5" fill="#ff7a2a" />
        <circle cx="32" cy="10" r="5.5" fill="url(#fl-burst)" />
        <path d="M28.5 23 Q32 14 35.5 23 Z" fill="#fff1d6" />
        <path d="M0 66 C 15 57, 22 38, 26 23 L 38 23 C 42 38, 49 55, 64 66 Z" fill="url(#fl-cone)" />
        <ellipse cx="32" cy="23.2" rx="6" ry="1.7" fill="#ffd774" />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M32 24 L29.5 32 L34 38.5 L29.5 46 L33 54 L31 66" stroke="#ff5a1f" strokeWidth="5" filter="url(#fl-soft)" />
          <path d="M32 24 L29.5 32 L34 38.5 L29.5 46 L33 54 L31 66" stroke="#ff8a2a" strokeWidth="3" />
          <path d="M32 24 L29.5 32 L34 38.5 L29.5 46 L33 54 L31 66" stroke="#ffe08a" strokeWidth="1.2" />
        </g>
      </g>
      <rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="rgba(255,138,69,0.35)" />
    </svg>
  );
}
