import type { AxisSignal } from "@/lib/axisSignal";
import type { AxisGate } from "@/lib/axisEntryGate";

export type AxisConfidence = {
overall: number;
signal: number;
gate: number;
phase: number;
line: number;
label: "LOW" | "MEDIUM" | "HIGH";
};

function clamp(value: number, min = 0, max = 100) {
return Math.max(min, Math.min(max, value));
}

function toLabel(score: number): AxisConfidence["label"] {
if (score < 55) return "LOW";
if (score < 80) return "MEDIUM";
return "HIGH";
}

export function computeRepConfidence(args: {
signal: AxisSignal;
gate: AxisGate;
lineScore: number;
phaseComplete: boolean;
}) : AxisConfidence {
const signalScore = clamp(
args.signal.signal * 0.4 +
args.signal.coverage * 0.3 +
args.signal.lock * 0.3
);

const gateScore = args.gate.admitted ? args.gate.score : args.gate.score * 0.5;

const phaseScore = args.phaseComplete ? 100 : 35;

const lineScore = clamp(args.lineScore);

const overall = clamp(
signalScore * 0.35 +
gateScore * 0.25 +
phaseScore * 0.2 +
lineScore * 0.2
);

return {
overall,
signal: Math.round(signalScore),
gate: Math.round(gateScore),
phase: Math.round(phaseScore),
line: Math.round(lineScore),
label: toLabel(overall),
};
}

export function computeSessionConfidence(repConfidences: number[]) {
if (!repConfidences.length) {
return {
overall: 0,
label: "LOW" as const,
};
}

const avg =
repConfidences.reduce((sum, value) => sum + value, 0) / repConfidences.length;

const overall = Math.round(avg);

return {
overall,
label: toLabel(overall),
};
}