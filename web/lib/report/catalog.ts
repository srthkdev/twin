// The report catalog: the only building blocks the agent may compose a report from (json-render style:
// the model chooses blocks and fills their props; it cannot invent layout or components).
// Shared by the report tool (validation), the web renderer (@json-render/react) and the PDF renderer (@json-render/react-pdf).
import { z } from "zod";

export const mapLink = z.string().regex(/^(?:hood:[A-Za-z0-9_-]+|geo:-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)$/, "use hood:<id> or geo:<lat>,<lon>");

export const BLOCKS = {
  Verdict: {
    description: "The decision, first. GO = act, WATCH = promising but check something, SKIP = don't, INFO = no decision asked.",
    props: z.object({ label: z.enum(["GO", "WATCH", "SKIP", "INFO"]), line: z.string().min(1).max(280) }).strict(),
  },
  KpiRow: {
    description: "2–4 headline numbers in plain words (\"82% match\", \"12 wine bars\"). Values must come from tool results.",
    props: z.object({ items: z.array(z.object({ label: z.string().min(1), value: z.string().min(1), note: z.string().optional(), link: mapLink.optional() }).strict()).min(1).max(4) }).strict(),
  },
  Heading: {
    description: "A section heading.",
    props: z.object({ text: z.string().min(1).max(90) }).strict(),
  },
  Paragraph: {
    description: "Short markdown prose (≤120 words). Link places as [name](hood:id) or [name](geo:lat,lon); cite web facts as [source](https://…).",
    props: z.object({ markdown: z.string().min(1).max(1600) }).strict(),
  },
  Chart: {
    description: "A chart created earlier with the chart tool, referenced by its id (fig-N).",
    props: z.object({ id: z.string().regex(/^fig-\d+$/), note: z.string().max(200).optional() }).strict(),
  },
  Ranking: {
    description: "A ranked list of places with one measured reason each — the shortlist.",
    props: z.object({
      title: z.string().min(1),
      items: z.array(z.object({ label: z.string().min(1), link: mapLink.optional(), metric: z.string().optional(), reason: z.string().min(1).max(200) }).strict()).min(1).max(10),
    }).strict(),
  },
  Compare: {
    description: "Two options side by side on the same measures.",
    props: z.object({
      left: z.object({ title: z.string().min(1), link: mapLink.optional() }).strict(),
      right: z.object({ title: z.string().min(1), link: mapLink.optional() }).strict(),
      rows: z.array(z.object({ measure: z.string().min(1), left: z.string(), right: z.string() }).strict()).min(1).max(8),
    }).strict(),
  },
  Table: {
    description: "A small table of measured values.",
    props: z.object({ columns: z.array(z.string().min(1)).min(2).max(6), rows: z.array(z.array(z.string())).min(1).max(15), caption: z.string().optional() }).strict(),
  },
  Callout: {
    description: "One highlighted note: a risk, a caveat, or what the data cannot tell.",
    props: z.object({ tone: z.enum(["risk", "caveat", "tip"]), text: z.string().min(1).max(400) }).strict(),
  },
  Places: {
    description: "Real venues or blocks to visit, each a map link.",
    props: z.object({ items: z.array(z.object({ label: z.string().min(1), link: mapLink, note: z.string().max(160).optional() }).strict()).min(1).max(12) }).strict(),
  },
  NextSteps: {
    description: "2–5 concrete next actions for the reader.",
    props: z.object({ items: z.array(z.string().min(1).max(200)).min(1).max(5) }).strict(),
  },
} as const;

export type BlockType = keyof typeof BLOCKS;
export type BlockProps<T extends BlockType> = z.infer<(typeof BLOCKS)[T]["props"]>;
export type ReportBlock = { [T in BlockType]: { type: T; props: BlockProps<T> } }[BlockType];

export const blockSchema = z.discriminatedUnion(
  "type",
  (Object.keys(BLOCKS) as BlockType[]).map((t) => z.object({ type: z.literal(t), props: BLOCKS[t].props }).strict()) as never,
) as unknown as z.ZodType<ReportBlock>;

/** One line per block for prompts and tool descriptions. */
export const catalogPrompt = () => (Object.keys(BLOCKS) as BlockType[]).map((t) => `- ${t}: ${BLOCKS[t].description}`).join("\n");
