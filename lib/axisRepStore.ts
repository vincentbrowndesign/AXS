import type { AxisInterpretation, RepMetrics } from "@/lib/axisInterpret";

export type AxisRep = {
id: string;
ts: number;
metrics: RepMetrics;
interpretation: AxisInterpretation;
confidence: number;
};

let reps: AxisRep[] = [];

export function addRep(rep: AxisRep) {
reps.unshift(rep);

if (reps.length > 50) {
reps = reps.slice(0, 50);
}
}

export function getReps() {
return reps;
}

export function getLatestRep() {
return reps[0] ?? null;
}

export function clearReps() {
reps = [];
}