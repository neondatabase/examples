// The Neon Realtime zap from the Neon website's docs navigation. Other
// icons come straight from lucide-react.
export function ZapIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="-2.5 -2.5 27 27"
      fill="none"
      className={className}
    >
      <path
        d="M11.9219 0.914062L10.0885 8.2474H21.0885L10.0885 21.0807L11.9219 13.7474H0.921875L11.9219 0.914062Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
