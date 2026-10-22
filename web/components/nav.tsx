"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/explore", label: "explore" },
  { href: "/evals", label: "evals" },
  { href: "/method", label: "method" },
  { href: "/blog", label: "blog" },
];

export const NAV_H = 44;

export function Nav() {
  const path = usePathname();
  return (
    <header className="fixed inset-x-0 top-0 z-40 h-11 border-b border-line bg-background">
      <nav aria-label="Primary" className="flex h-full items-center gap-4 px-3 sm:gap-8 sm:px-4">
        <Link href="/" aria-label="Twin home" className="shrink-0"><Logo /></Link>
        <div className="flex h-full min-w-0 items-center gap-4 sm:gap-6">
          {LINKS.map((l) => {
            const active = path === l.href || path.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full shrink-0 items-center text-[12.5px] transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
                {active && <span className="absolute inset-x-0 -bottom-px h-px bg-primary" />}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto hidden shrink-0 items-center gap-4 text-[11px] text-dim md:flex">
          <span>taste data via <a className="link text-muted-foreground" href="https://qloo.com" target="_blank" rel="noreferrer">qloo</a></span>
          <a className="link text-muted-foreground" href="https://github.com/srthkdev/twin" target="_blank" rel="noreferrer">source</a>
        </div>
      </nav>
    </header>
  );
}
