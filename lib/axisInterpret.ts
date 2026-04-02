export type EnterTag = "RUSHED" | "CLEAN" | "DELAYED";
export type ShiftTag = "RUSHED" | "CLEAN" | "DELAYED";
export type HoldTag = "SHORT" | "CLEAN";
export type LineTag = "STRAIGHT" | "OFF";
export type IntegrityTag = "BROKEN" | "STABLE" | "STRONG";

export type RepTruth = {
enter: EnterTag;
shift: ShiftTag;
hold: HoldTag;
line: LineTag;
integrity: IntegrityTag;
signal: number;
summary: string[];
};

export type InterpretRepInput = {
waveValues: number[];
capturedAt: number;
startedAt: number;
};

export function interpretRep(input: InterpretRepInput): RepTruth {
const { waveValues } = input;

if (!waveValues.length) {
return {
enter: "DELAYED",
shift: "DELAYED",
hold: "SHORT",
line: "OFF",
integrity: "BROKEN",
signal: 22,
summary: [
"No usable signal was captured.",
"The rep did not hold enough structure to interpret cleanly.",
],
};
}

const avg = mean(waveValues);
const min = Math.min(...waveValues);
const max = Math.max(...waveValues);
const span = max - min;

const first = mean(sliceSafe(waveValues, 0, 16));
const mid = mean(sliceSafe(waveValues, 24, 40));
const last = mean(sliceSafe(waveValues, Math.max(waveValues.length - 16, 0), waveValues.length));

const enter: EnterTag =
first > 61 ? "RUSHED" : first < 42 ? "DELAYED" : "CLEAN";

const shift: ShiftTag =
mid > 63 ? "RUSHED" : mid < 45 ? "DELAYED" : "CLEAN";

const hold: HoldTag = last < 46 ? "SHORT" : "CLEAN";

const line: LineTag = span <= 28 ? "STRAIGHT" : "OFF";

let integrity: IntegrityTag = "STABLE";
if (span > 34 || (enter === "RUSHED" && hold === "SHORT")) {
integrity = "BROKEN";
} else if (span < 20 && shift === "CLEAN" && line === "STRAIGHT") {
integrity = "STRONG";
}

const signal = clamp(
Math.round(
100 -
Math.abs(avg - 52) * 1.3 -
Math.max(0, span - 18) * 1.2 -
(enter === "RUSHED" ? 8 : 0) -
(shift === "RUSHED" ? 8 : 0) -
(hold === "SHORT" ? 10 : 0) -
(line === "OFF" ? 10 : 0)
),
22,
94
);

const summary: string[] = [
sentenceForEnter(enter),
sentenceForShift(shift),
sentenceForHold(hold),
sentenceForLine(line),
sentenceForIntegrity(integrity),
];

return {
enter,
shift,
hold,
line,
integrity,
signal,
summary,
};
}

export function sentenceForEnter(value: EnterTag): string {
if (value === "RUSHED") return "You rushed the entry.";
if (value === "DELAYED") return "You delayed the entry and lost pace.";
return "Your entry was clean.";
}

export function sentenceForShift(value: ShiftTag): string {
if (value === "RUSHED") return "The shift happened before control was established.";
if (value === "DELAYED") return "The shift came late and the rep stalled.";
return "The shift was clean.";
}

export function sentenceForHold(value: HoldTag): string {
if (value === "SHORT") return "You cut the hold short.";
return "You held the rep long enough to show control.";
}

export function sentenceForLine(value: LineTag): string {
if (value === "OFF") return "The line broke early.";
return "The line stayed straight.";
}

export function sentenceForIntegrity(value: IntegrityTag): string {
if (value === "BROKEN") return "Integrity broke under the rep.";
if (value === "STRONG") return "The rep held strong from entry to finish.";
return "The rep stayed mostly stable.";
}

export function buildLiveSignal(previous: number): number {
const drift = Math.random() * 16 - 8;
const pull = (52 - previous) * 0.08;
const next = previous + drift + pull;
return clamp(Math.round(next), 18, 86);
}

function mean(values: number[]): number {
if (!values.length) return 0;
return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
return Math.max(min, Math.min(max, value));
}

function sliceSafe(values: number[], start: number, end: number): number[] {
const sliced = values.slice(start, end);
return sliced.length ? sliced : values;
}