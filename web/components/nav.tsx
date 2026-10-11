"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";
import { isMockData } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/evals", label: "Evals" },
  { href: "/method", label: "Method" },
];

export function Nav() {
  const path = usePathname();
  const [mock, setMock] = useState(false);
  useEffect(() => { isMockData().then(setMock); }, []);
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-3 sm:px-4">
      <nav aria-label="Primary" className="glass pointer-events-auto flex w-full max-w-5xl items-center justify-between rounded-2xl px-3 py-2 sm:px-4">
        <Link href="/" aria-label="Twin home" className="rounded-md px-1"><Logo /></Link>
        <div className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = path === l.href || path.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active ? "text-white" : "text-muted-foreground hover:text-white",
                )}
              >
                {active && <span className="absolute inset-0 -z-10 rounded-lg bg-white/10" />}
                {l.label}
              </Link>
            );
          })}
          {mock && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="ml-1 hidden cursor-help border-amber-400/40 text-[10px] text-amber-300 sm:inline-flex">DEMO DATA</Badge>
              </TooltipTrigger>
              <TooltipContent>Real pipeline data not found in /data — showing generated mock data.</TooltipContent>
            </Tooltip>
          )}
        </div>
      </nav>
    </header>
  );
}
