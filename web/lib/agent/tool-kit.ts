// Shared tool plumbing (split out of tools.ts so v2 tool modules can use it without an import cycle).
import type { z } from "zod";
import type { DataSet } from "../types";
import type { AgentAction } from "./types";
import type { QlooStats } from "./qloo";

export interface ToolContext { ds: DataSet; stats: QlooStats; progress: (note: string) => void }
export interface ToolOutput { data: unknown; summary: string; uiActions?: AgentAction[] }
export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  live?: boolean; // calls Qloo live
  run(args: z.infer<S>, ctx: ToolContext): Promise<ToolOutput>;
}
export const defineTool = <S extends z.ZodType>(t: ToolDef<S>) => t as unknown as ToolDef;

/** A user-presentable failure: its message is shown to the model/UI verbatim. */
export class ToolError extends Error {}

export const r2 = (x: number) => Math.round(x * 100) / 100;
export const r3 = (x: number) => Math.round(x * 1000) / 1000;
