/**
 * The mark is two geohash cells on a 2×2 grid, lit on the diagonal — the same glyph as ▚.
 * Two places, one taste: the twin pair the whole product is about.
 */
export function LogoMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <rect x="0.5" y="0.5" width="8.5" height="8.5" fill="var(--primary)" />
      <rect x="11" y="11" width="8.5" height="8.5" fill="var(--primary)" />
      <rect x="11.5" y="1" width="7.5" height="7.5" stroke="var(--line-strong)" />
      <rect x="1" y="11.5" width="7.5" height="7.5" stroke="var(--line-strong)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[14px] font-semibold tracking-[-0.02em] text-foreground">twin</span>
    </span>
  );
}
