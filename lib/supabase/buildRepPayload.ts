import type { AxisRepRow } from "./saveRep";

type BuildRepPayloadArgs = {
sessionId: string;
axisState?: string | null;

lockScore?: number | null;
signalScore?: number | null;
integrityScore?: number | null;
sessionScore?: number | null;

latestRep?: {
entry?: string | null;
core?: string | null;
exit?: string | null;
confidence?: number | null;
line?: number | null;
timing?: number | null;
[key: string]: unknown;
} | null;
};

function toNumber(value: unknown): number | null {
if (typeof value === "number" && Number.isFinite(value)) return value;
return null;
}

function toStringOrNull(value: unknown): string | null {
return typeof value === "string" ? value : null;
}

export function buildRepPayload(args: BuildRepPayloadArgs): AxisRepRow {
const { sessionId, axisState, lockScore, signalScore, integrityScore, sessionScore, latestRep } = args;

return {
session_id: sessionId,
state: toStringOrNull(axisState),

lock_score: toNumber(lockScore),
signal_score: toNumber(signalScore),
integrity_score: toNumber(integrityScore),
session_score: toNumber(sessionScore),

entry_tag: toStringOrNull(latestRep?.entry),
core_tag: toStringOrNull(latestRep?.core),
exit_tag: toStringOrNull(latestRep?.exit),

confidence: toNumber(latestRep?.confidence),
line_score: toNumber(latestRep?.line),
timing_ms: toNumber(latestRep?.timing),

raw: latestRep && typeof latestRep === "object" ? latestRep : null,
};
}