"use client";

type Props = {
  size?: number;
  className?: string;
  glow?: boolean;
};

/**
 * Luna Luminary Spark Logo:
 * Inspired by Claude & Gemini's celestial spark aesthetic — a bespoke
 * radiant 4-pointed star with sweeping concave flares and an interlocking
 * multi-spectral core, rendered with rich violet-to-cyan celestial gradients.
 */
export function LunaLogo({ size = 28, className = "", glow = false }: Props) {
  const id = "luna-spark";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-300 ${
        glow ? "drop-shadow-[0_0_16px_rgba(129,140,248,0.7)]" : ""
      } ${className}`}
    >
      <defs>
        {/* Primary Celestial Sparkle Gradient (Gemini/Claude palette) */}
        <linearGradient
          id={`${id}-primary`}
          x1="3"
          y1="3"
          x2="29"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="28%" stopColor="#818cf8" />
          <stop offset="65%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>

        {/* Diagonal Secondary Ray Gradient */}
        <linearGradient
          id={`${id}-secondary`}
          x1="8"
          y1="8"
          x2="24"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="50%" stopColor="#a5b4fc" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>

        {/* Center Radiant Core Glow */}
        <radialGradient
          id={`${id}-core`}
          cx="16"
          cy="16"
          r="6"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#e0e7ff" stopOpacity="0.95" />
          <stop offset="70%" stopColor="#818cf8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#4338ca" stopOpacity="0" />
        </radialGradient>

        {/* Specular Core Flare */}
        <linearGradient
          id={`${id}-specular`}
          x1="12"
          y1="12"
          x2="20"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>

        {/* Ambient Blur */}
        <filter id={`${id}-ambient`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {/* Ambient background aura */}
      <circle
        cx="16"
        cy="16"
        r="10"
        fill={`url(#${id}-primary)`}
        opacity="0.22"
        filter={`url(#${id}-ambient)`}
      />

      {/* Diagonal Secondary 4-Point Spark (Claude-style organic warmth) */}
      <path
        d="M16 6.5C16 11.5 20.5 16 25.5 16C20.5 16 16 20.5 16 25.5C16 20.5 11.5 16 6.5 16C11.5 16 16 11.5 16 6.5Z"
        fill={`url(#${id}-secondary)`}
        opacity="0.55"
        transform="rotate(45 16 16)"
      />

      {/* Primary 4-Point Radiant Starburst (Gemini-style precision flares) */}
      <path
        d="M16 2C16 9.5 22.5 16 30 16C22.5 16 16 22.5 16 30C16 22.5 9.5 16 2 16C9.5 16 16 9.5 16 2Z"
        fill={`url(#${id}-primary)`}
      />

      {/* Top-Left Specular Sheen Arc */}
      <path
        d="M16 2C16 9.5 9.5 16 2 16C7.5 15 13 11 15 5.5L16 2Z"
        fill="url(#luna-spark-specular)"
        opacity="0.65"
      />

      {/* Radiant Central Core Glow */}
      <circle cx="16" cy="16" r="5.5" fill={`url(#${id}-core)`} />

      {/* Pinpoint Center Star */}
      <circle cx="16" cy="16" r="1.4" fill="#ffffff" />
    </svg>
  );
}

/**
 * Avatar badge variant for message bubbles and tool headers.
 */
export function LunaAvatar({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl border shadow-sm transition-all duration-200 hover:scale-105 ${className}`}
      style={{
        width: size,
        height: size,
        background: "var(--accent-soft)",
        borderColor: "var(--border)",
      }}
      aria-label="Luna AI"
    >
      <LunaLogo size={size * 0.75} />
    </div>
  );
}

/**
 * Hero badge variant for empty state & greetings.
 */
export function LunaHeroLogo({
  size = 68,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`relative grid place-items-center rounded-3xl p-3.5 shadow-2xl transition-all duration-300 hover:scale-105 ${className}`}
      style={{
        width: size,
        height: size,
        background:
          "linear-gradient(145deg, var(--bg-raised), var(--bg-sunken))",
        border: "1px solid var(--border-strong)",
        boxShadow:
          "0 20px 45px -15px rgba(99, 102, 241, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.25)",
      }}
    >
      <LunaLogo size={size * 0.78} glow />
    </div>
  );
}
