import type { PhaseMapping } from "@norma/config";
import { type NormalizedTask, Phase, isPhase } from "@norma/core";
import type { ApplyInstruction, RawIssue } from "./types.js";

const eqi = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hasLabel = (labels: string[], l: string) => labels.some((x) => eqi(x, l));

/**
 * Classify a raw (state, labels) pair into a canonical phase using the ordered
 * rules — first match wins. Falls back to BACKLOG if nothing matches (and the
 * caller can surface that as an anomaly).
 */
export function classifyPhase(state: string, labels: string[], mapping: PhaseMapping): Phase {
  for (const rule of mapping.classify) {
    const stateOk = rule.when.state === undefined || eqi(rule.when.state, state);
    const labelOk = rule.when.label === undefined || hasLabel(labels, rule.when.label);
    if (stateOk && labelOk) return rule.phase as Phase;
  }
  return Phase.BACKLOG;
}

/** Derive the owning worker type from a label prefix (e.g. "agent:" → "api"). */
export function ownerOf(labels: string[], mapping: PhaseMapping): string | null {
  const prefix = mapping.owner.fromLabelPrefix;
  const l = labels.find((x) => x.toLowerCase().startsWith(prefix.toLowerCase()));
  return l ? l.slice(prefix.length) : null;
}

/** Derive the batch key from a label prefix (keeps the full label as the key). */
export function batchOf(labels: string[], mapping: PhaseMapping): string | null {
  const prefix = mapping.batch.fromLabelPrefix;
  const l = labels.find((x) => x.toLowerCase().startsWith(prefix.toLowerCase()));
  return l ?? null;
}

/** Look up the tracker write for a target phase. Undefined if the phase has no write rule. */
export function applyFor(phase: Phase, mapping: PhaseMapping): ApplyInstruction | undefined {
  const rule = mapping.apply[phase];
  if (!rule) return undefined;
  return { state: rule.state, addLabels: rule.addLabels, removeLabels: rule.removeLabels };
}

/** Normalize a list of raw issues into engine tasks. */
export function normalize(raw: RawIssue[], mapping: PhaseMapping): NormalizedTask[] {
  return raw.map((r) => ({
    id: r.id,
    ref: r.ref,
    title: r.title,
    url: r.url,
    phase: classifyPhase(r.state, r.labels, mapping),
    owner: ownerOf(r.labels, mapping),
    batch: batchOf(r.labels, mapping),
    bounces: r.bounces ?? 0,
    blockedBy: r.blockedBy.map((b) => ({
      ref: b.ref,
      // Blockers are classified by state alone (labels unavailable across the edge);
      // the dep-done phases (released/done/canceled) are all state-only, so this is exact.
      phase: classifyPhase(b.state, [], mapping),
    })),
    order: r.order,
  }));
}

export { isPhase };
