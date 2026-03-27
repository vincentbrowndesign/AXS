import type { AxisSignal } from "@/lib/axisSignal";

export type AxisGateState =
| "SEARCHING"
| "CENTERING"
| "LOCKING"
| "READY";

export type AxisGate = {
state: AxisGateState;
admitted: boolean;
message: string;
score: number;
};

const GATE_THRESHOLDS = {
centerMin: 70,
coverageMin: 55,
lockMin: 72,
};

function clamp(value: number, min = 0, max = 100) {
return Math.max(min, Math.min(max, value));
}

export function evaluateEntryGate(signal: AxisSignal): AxisGate {
if (!signal.shouldersVisible || !signal.hipsVisible) {
return {
state: "SEARCHING",
admitted: false,
message: "Find body",
score: 0,
};
}

if (signal.center < GATE_THRESHOLDS.centerMin) {
return {
state: "CENTERING",
admitted: false,
message: "Center body",
score: clamp(signal.center),
};
}

if (
signal.coverage < GATE_THRESHOLDS.coverageMin ||
signal.lock < GATE_THRESHOLDS.lockMin
) {
return {
state: "LOCKING",
admitted: false,
message: `Locking… ${Math.round(signal.lock)}%`,
score: clamp((signal.lock + signal.coverage) / 2),
};
}

return {
state: "READY",
admitted: true,
message: "Axis Ready",
score: clamp((signal.lock + signal.center + signal.coverage) / 3),
};
}