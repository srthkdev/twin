// Free models sometimes send tool arguments in shapes no schema expects: text as {"$text": "…"} (an XML-style
// tool-calling habit) or arrays/objects as JSON-encoded strings. Repair those deterministically before validation
// gives up, instead of letting the model burn steps retrying the same call.
import type { ToolCallRepairFunction, ToolSet } from "ai";

function unwrap(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(unwrap);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && (keys[0] === "$text" || keys[0] === "#text" || keys[0] === "_text") && typeof o[keys[0]] === "string") return o[keys[0]];
    return Object.fromEntries(keys.map((k) => [k, unwrap(o[k])]));
  }
  if (typeof v === "string") {
    const s = v.trim();
    if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith("{") && s.endsWith("}"))) {
      try { return unwrap(JSON.parse(s)); } catch { /* a real string */ }
    }
  }
  return v;
}

export const repairToolCall: ToolCallRepairFunction<ToolSet> = async ({ toolCall }) => {
  try {
    const fixed = JSON.stringify(unwrap(JSON.parse(toolCall.input)));
    return fixed === toolCall.input ? null : { ...toolCall, input: fixed };
  } catch { return null; }
};
