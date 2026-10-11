export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="tw-g" x1="2" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="16" r="9" stroke="url(#tw-g)" strokeWidth="2" />
      <circle cx="20" cy="16" r="9" stroke="url(#tw-g)" strokeWidth="2" strokeOpacity="0.55" />
      <path d="M16 8.2a9 9 0 0 1 0 15.6 9 9 0 0 1 0-15.6Z" fill="url(#tw-g)" />
    </svg>
  );
}
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">Twin</span>
    </span>
  );
}
