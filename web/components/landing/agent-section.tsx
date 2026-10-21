import Link from "next/link";
import { reportHref, ROLES } from "./report-links";

export function AgentSection() {
  return (
    <div className="space-y-5">
      <p className="max-w-[68ch] text-[13px] leading-relaxed text-muted-foreground">Choose a decision. Get a report with a verdict, charts, places you can click on the map, and the evidence behind the recommendation.</p>
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
        {ROLES.map((role) => (
          <Link key={role.id} href={reportHref(role.question)} className="group flex flex-col bg-card p-5 transition-colors hover:bg-raised">
            <p className="label text-primary">{role.label}</p>
            <h3 className="mt-3 text-[16px] text-foreground">{role.title}</h3>
            <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{role.body}</p>
            <div className="mt-5 border-t border-line pt-3 text-[12px] text-dim transition-colors group-hover:text-primary">{role.question} <span aria-hidden>→</span></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
