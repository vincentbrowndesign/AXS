import type { AxisState } from "@/lib/axisSignal";

export const PHASE_STICKY_MS: Record<AxisState, number> = {
NO_SUBJECT: 0,
LOCKING: 180,
SET: 140,
RISE: 120,
RELEASE: 100,
LAND: 140,
};

export type StickyPhaseMemory = {
current: AxisState;
candidate: AxisState;
candidateSince: number;
};

export function createStickyPhaseMemory(): StickyPhaseMemory {
return {
current: "NO_SUBJECT",
candidate: "NO_SUBJECT",
candidateSince: 0,
};
}

export function updateStickyPhase(
memory: StickyPhaseMemory,
nextPhase: AxisState,
now: number
): StickyPhaseMemory {
if (nextPhase === memory.current) {
return {
...memory,
candidate: nextPhase,
candidateSince: now,
};
}

if (nextPhase !== memory.candidate) {
return {
...memory,
candidate: nextPhase,
candidateSince: now,
};
}

const needed = PHASE_STICKY_MS[nextPhase];
if (now - memory.candidateSince >= needed) {
return {
current: nextPhase,
candidate: nextPhase,
candidateSince: now,
};
}

return memory;
}