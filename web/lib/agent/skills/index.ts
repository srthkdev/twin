import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineTool, type ToolContext } from "../tool-kit";
import type { AgentRunContext } from "../report";

export const REPORT_SKILLS = {
  "site-selection": "Where to open a concept: demand, existing venues and a site shortlist.",
  expansion: "Find a working concept's twin in another city and check competition.",
  "gap-scan": "Find venue kinds present in foreign twins but missing at home.",
  relocation: "Find a familiar scene in a new city and real places to start.",
  "tour-routing": "Shortlist cities and venues using fan signals, momentum and audience.",
  "neighbourhood-profile": "Describe a neighbourhood through measured tastes and real places.",
  "city-compare": "Compare two places on shared tastes and the same supply measures.",
} as const;

export const skillNames = Object.keys(REPORT_SKILLS) as [keyof typeof REPORT_SKILLS, ...(keyof typeof REPORT_SKILLS)[]];
export const reportSkillPrompt = () => skillNames.map((name) => `- ${name}: ${REPORT_SKILLS[name]}`).join("\n");

export async function loadReportSkill(name: keyof typeof REPORT_SKILLS) {
  return readFile(join(process.env.TWIN_WEB_ROOT ?? process.cwd(), "lib", "agent", "skills", `${name}.md`), "utf8");
}

export const reportSkillTool = defineTool({
  name: "report_skill",
  description: "Load the report playbook before any report, plan, analysis, comparison or decision. Follow its evidence order, plan the block outline, then call chart and report. This enables the report step budget.",
  schema: z.object({ name: z.enum(skillNames) }).strict(),
  async run({ name }, ctx) {
    const run = (ctx as ToolContext & { run?: AgentRunContext }).run;
    if (run) { run.reportMode = true; run.skill = name; }
    return { data: { name, playbook: await loadReportSkill(name) }, summary: `${name} playbook loaded` };
  },
});
