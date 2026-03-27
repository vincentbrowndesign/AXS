export type AxisObservation =
| "NO_TARGET"
| "LOW_SIGNAL"
| "UNSTABLE_FRAME"
| "STABLE_FRAME"
| "STRAIGHT_LINE"
| "OFF_LINE"
| "TIMING_EARLY"
| "TIMING_LATE"
| "TIMING_CLEAN";

export type AxisState =
| "NO_TARGET"
| "ACQUIRING"
| "BUILDING"
| "READY"
| "COMPRESSED"
| "FORCED"
| "CLEAN"
| "UNCLEAR";

export type AxisAvailability =
| "RESET_AVAILABLE"
| "HOLD_AVAILABLE"
| "SHIFT_AVAILABLE"
| "RELEASE_AVAILABLE"
| "PASS_WINDOW_POSSIBLE"
| "DRIVE_WINDOW_POSSIBLE"
| "UNCLEAR";

export type AxisFix =
| "ACQUIRE_BODY"
| "STABILIZE_ENTRY"
| "RECENTER_FRAME"
| "HOLD_LONGER"
| "DELAY_ACTION"
| "REDUCE_DRIFT"
| "CLEAR_BASE"
| "NONE";

export interface AxisInterpretationInput {
hasTarget: boolean;
signal: number;
integrity: number;
line?: number;
timing?: number;
}

export interface AxisInterpretation {
observation: string[];
state: AxisState;
availability: AxisAvailability[];
nextFix: AxisFix;
summary: string;
}

function clamp(n: number, min = 0, max = 100) {
return Math.max(min, Math.min(max, n));
}

export function resolveObservation(
input: AxisInterpretationInput,
): string[] {
const out: string[] = [];

if (!input.hasTarget) {
out.push("No target");
return out;
}

const signal = clamp(input.signal);
const integrity = clamp(input.integrity);
const line = clamp(input.line ?? 50);
const timing = clamp(input.timing ?? 50);

if (signal < 35) out.push("Low signal");
else out.push("Signal stable");

if (integrity < 45) out.push("Frame unstable");
else out.push("Frame stable");

if (line >= 70) out.push("Line straight");
else if (line <= 45) out.push("Line off");
else out.push("Line building");

if (timing < 40) out.push("Timing early");
else if (timing > 60) out.push("Timing late");
else out.push("Timing clean");

return out;
}

export function resolveState(
input: AxisInterpretationInput,
): AxisState {
if (!input.hasTarget) return "NO_TARGET";

const signal = clamp(input.signal);
const integrity = clamp(input.integrity);
const line = clamp(input.line ?? 50);

if (signal < 35) return "ACQUIRING";
if (integrity < 45) return "BUILDING";
if (signal >= 70 && integrity >= 70 && line >= 65) return "READY";
if (signal >= 55 && integrity < 55) return "COMPRESSED";
if (signal >= 45 && integrity >= 45 && line >= 70) return "CLEAN";

return "UNCLEAR";
}

export function resolveAvailability(
state: AxisState,
): AxisAvailability[] {
switch (state) {
case "NO_TARGET":
return ["UNCLEAR"];
case "ACQUIRING":
return ["RESET_AVAILABLE"];
case "BUILDING":
return ["HOLD_AVAILABLE", "RESET_AVAILABLE"];
case "READY":
return [
"SHIFT_AVAILABLE",
"RELEASE_AVAILABLE",
"PASS_WINDOW_POSSIBLE",
"DRIVE_WINDOW_POSSIBLE",
];
case "COMPRESSED":
return ["PASS_WINDOW_POSSIBLE", "RESET_AVAILABLE"];
case "CLEAN":
return ["SHIFT_AVAILABLE", "RELEASE_AVAILABLE"];
default:
return ["UNCLEAR"];
}
}

export function resolveFix(state: AxisState): AxisFix {
switch (state) {
case "NO_TARGET":
return "ACQUIRE_BODY";
case "ACQUIRING":
return "RECENTER_FRAME";
case "BUILDING":
return "STABILIZE_ENTRY";
case "COMPRESSED":
return "DELAY_ACTION";
case "FORCED":
return "HOLD_LONGER";
case "CLEAN":
case "READY":
return "NONE";
default:
return "CLEAR_BASE";
}
}

export function buildSummary(
state: AxisState,
fix: AxisFix,
availability: AxisAvailability[],
): string {
const stateText: Record<AxisState, string> = {
NO_TARGET: "No target.",
ACQUIRING: "Acquiring body.",
BUILDING: "Building frame.",
READY: "Ready.",
COMPRESSED: "Compressed.",
FORCED: "Forced.",
CLEAN: "Clean.",
UNCLEAR: "Unclear.",
};

const fixText: Record<AxisFix, string> = {
ACQUIRE_BODY: "Enter frame.",
STABILIZE_ENTRY: "Stabilize entry.",
RECENTER_FRAME: "Re-center frame.",
HOLD_LONGER: "Hold longer.",
DELAY_ACTION: "Delay action.",
REDUCE_DRIFT: "Reduce drift.",
CLEAR_BASE: "Clear base.",
NONE: "Maintain.",
};

const firstAvailable = availability[0]
?.replaceAll("_", " ")
.toLowerCase();

if (!firstAvailable || firstAvailable === "unclear") {
return `${stateText[state]} ${fixText[fix]}`;
}

return `${stateText[state]} ${firstAvailable}. ${fixText[fix]}`;
}

export function interpretAxis(
input: AxisInterpretationInput,
): AxisInterpretation {
const observation = resolveObservation(input);
const state = resolveState(input);
const availability = resolveAvailability(state);
const nextFix = resolveFix(state);
const summary = buildSummary(state, nextFix, availability);

return {
observation,
state,
availability,
nextFix,
summary,
};
}