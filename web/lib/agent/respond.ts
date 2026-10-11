import type { DataSet } from "../types";
import type { Agent, AgentRequest, AgentResponse } from "./types";
import { explainMatch, findCity, findHood, findTwins, listHoods, norm } from "./tools";

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

/** Deterministic, data-backed responder. Swap for an LLM agent by implementing `Agent`. */
export function createRuleAgent(ds: DataSet): Agent {
  const label = (i: number) => ds.basket[i]?.label ?? `#${i}`;
  const cityName = (id: string) => ds.cities.find((c) => c.id === id)?.name ?? id;
  const hoodName = (id: string) => ds.hoods.find((h) => h.id === id)?.name ?? id;

  function twinReply(fromId: string, toCity: string): AgentResponse {
    const from = ds.hoods.find((h) => h.id === fromId)!;
    const tw = findTwins(ds, fromId, toCity, 3);
    if (!tw.length) return { intent: "find", reply: `I have no twins for ${from.name} in ${cityName(toCity)}.` };
    const top = tw[0];
    const shared = top.shared.slice(0, 4).map((s) => label(s.i));
    const others = tw.slice(1).map((t) => `${hoodName(t.hood)} (${t.score.toFixed(2)})`);
    return {
      intent: "find",
      reply: `${from.name}'s closest ${cityName(toCity)} twin is ${hoodName(top.hood)} (${top.score.toFixed(2)}). They share ${list(shared)}.` +
        (others.length ? ` Runners-up: ${list(others)}.` : ""),
      actions: [{ type: "select", from: fromId, to: toCity, twin: top.hood }],
    };
  }

  return {
    async respond({ messages, context }: AgentRequest): Promise<AgentResponse> {
      const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const q = norm(last);

      // compare X and Y / X vs Y
      const cmp = q.match(/(?:compare|difference between)?\s*(.+?)\s+(?:and|vs|versus|with|to)\s+(.+)/);
      if (/\b(compare|vs|versus|difference|differ)\b/.test(q) && cmp) {
        const a = findHood(ds, cmp[1]);
        const b = findHood(ds, cmp[2]);
        if (a && b && a.id !== b.id) {
          const ex = explainMatch(ds, a.id, b.id)!;
          return {
            intent: "compare",
            reply: `${a.name} vs ${b.name}: cosine ${ex.score.toFixed(2)}. Common ground: ${list(ex.shared.slice(0, 4).map((s) => label(s.i)))}. ` +
              `Where they split: ${list(ex.diverge.slice(0, 3).map((s) => `${label(s.i)} (${s.a.toFixed(1)} vs ${s.b.toFixed(1)})`))}.`,
            actions: a.city !== b.city ? [{ type: "select", from: a.id, to: b.city, twin: b.id }] : undefined,
          };
        }
      }

      // find the X of Y
      const m = q.match(/(?:find|show|what is|whats|where is|get)?\s*(?:me )?(?:the )?(.+?) (?:of|in|from) (.+)/);
      if (m && !/^why\b/.test(q)) {
        const toCity = findCity(ds, m[2]);
        const hood = findHood(ds, m[1]);
        if (hood && toCity) {
          if (toCity === hood.city) return { intent: "find", reply: `${hood.name} is already in ${cityName(toCity)}. Pick another target city and I will find its twin.` };
          return twinReply(hood.id, toCity);
        }
      }

      // why
      if (/\bwhy\b|explain|how come|what do they share/.test(q)) {
        const fromId = findHood(ds, last)?.id ?? context?.fromHood ?? null;
        const toCity = findCity(ds, last) ?? context?.toCity ?? null;
        if (fromId && toCity) {
          const top = findTwins(ds, fromId, toCity, 1)[0];
          if (top) {
            const ex = explainMatch(ds, fromId, top.hood)!;
            return {
              intent: "why",
              reply: `${ex.a.name} matches ${ex.b.name} (${ex.score.toFixed(2)}) because both over-index on ${list(ex.shared.slice(0, 5).map((s) => label(s.i)))}. ` +
                `They diverge on ${list(ex.diverge.slice(0, 2).map((s) => label(s.i)))}.`,
              actions: [{ type: "select", from: fromId, to: toCity, twin: top.hood }],
            };
          }
        }
        return { intent: "why", reply: "Pick a source neighbourhood and a target city first, then ask me why they match." };
      }

      // list hoods
      if (/\b(list|which|what)\b.*\b(hoods|neighbou?rhoods|areas)\b/.test(q)) {
        const c = findCity(ds, last) ?? context?.toCity;
        if (c) return { intent: "list", reply: `${cityName(c)} has ${list(listHoods(ds, c).map((h) => h.name))}.` };
      }

      // bare hood + context city, or bare city + context hood
      const hood = findHood(ds, last);
      const city = findCity(ds, last);
      if (hood && (city || context?.toCity) && (city ?? context?.toCity) !== hood.city) return twinReply(hood.id, (city ?? context!.toCity)!);
      if (city && context?.fromHood && ds.hoods.find((h) => h.id === context.fromHood)?.city !== city) return twinReply(context.fromHood, city);
      if (hood) {
        return { intent: "hood", reply: `${hood.name}: ${hood.blurb ?? "a distinctive taste profile"}. Top traits: ${list(hood.top.slice(0, 4).map(label))}. Ask me for its twin in another city.` };
      }

      return {
        intent: "help",
        reply: 'Try "find the Silver Lake of Berlin", "why do they match?", or "compare Shoreditch and Neukölln".',
      };
    },
  };
}
