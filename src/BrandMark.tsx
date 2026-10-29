export default function BrandMark({ size = 29 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="Erkinode"
      role="img"
    >
      <path
        d="M24.5 6H13a7 7 0 0 0-7 7v6a7 7 0 0 0 7 7h11.5M6 16h13"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24.5" cy="6" r="2.5" fill="currentColor" />
      <circle cx="24.5" cy="26" r="2.5" fill="currentColor" />
      <circle cx="23" cy="16" r="3" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}
