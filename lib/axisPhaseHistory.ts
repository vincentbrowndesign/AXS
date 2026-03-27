import type { AxisState } from "@/lib/axisSignal";

export type RepWindow = {
lockingAt: number | null;
setAt: number | null;
riseAt: number | null;
releaseAt: number | null;
landAt: number | null;
};

export function createEmptyRepWindow(): RepWindow {
return {
lockingAt: null,
setAt: null,
riseAt: null,
releaseAt: null,
landAt: null,
};
}

export function applyPhaseToRep(
rep: RepWindow,
phase: AxisState,
ts: number
): RepWindow {
const next = { ...rep };

if (phase === "LOCKING" && next.lockingAt === null) next.lockingAt = ts;
if (phase === "SET" && next.setAt === null) next.setAt = ts;
if (phase === "RISE" && next.riseAt === null) next.riseAt = ts;
if (phase === "RELEASE" && next.releaseAt === null) next.releaseAt = ts;
if (phase === "LAND" && next.landAt === null) next.landAt = ts;

return next;
}

export function repIsComplete(rep: RepWindow) {
return (
rep.setAt !== null &&
rep.riseAt !== null &&
rep.releaseAt !== null &&
rep.landAt !== null
);
}

export function toRepMetrics(
rep: RepWindow,
lineScore: number
) {
if (
rep.lockingAt === null ||
rep.setAt === null ||
rep.riseAt === null ||
rep.releaseAt === null ||
rep.landAt === null
) {
return null;
}

return {
enterTime: Math.max(0, rep.setAt - rep.lockingAt),
goTime: Math.max(0, rep.releaseAt - rep.riseAt),
holdTime: Math.max(0, rep.landAt - rep.releaseAt),
lineScore,
};
}