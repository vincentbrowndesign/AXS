export type AxisSessionSummary = {
totalReps: number;

cleanPct: number;
rushedPct: number;
delayedPct: number;

straightPct: number;
offLinePct: number;

shortHoldPct: number;
goodHoldPct: number;
};

export type AxisReport = {
topEntry: "clean" | "rushed" | "delayed";
topLine: "straight" | "off";
topHold: "short" | "good";

summary: AxisSessionSummary;
};

// 🔑 SAFELY get highest % (fixes readonly issue)
function topEntry(summary: AxisSessionSummary): AxisReport["topEntry"] {
const pairs = [
["clean", summary.cleanPct],
["rushed", summary.rushedPct],
["delayed", summary.delayedPct],
] as const;

return [...pairs].sort((a, b) => b[1] - a[1])[0][0];
}

function topLine(summary: AxisSessionSummary): AxisReport["topLine"] {
const pairs = [
["straight", summary.straightPct],
["off", summary.offLinePct],
] as const;

return [...pairs].sort((a, b) => b[1] - a[1])[0][0];
}

function topHold(summary: AxisSessionSummary): AxisReport["topHold"] {
const pairs = [
["good", summary.goodHoldPct],
["short", summary.shortHoldPct],
] as const;

return [...pairs].sort((a, b) => b[1] - a[1])[0][0];
}

// 🔥 MAIN REPORT BUILDER
export function buildAxisReport(
summary: AxisSessionSummary
): AxisReport {
return {
topEntry: topEntry(summary),
topLine: topLine(summary),
topHold: topHold(summary),
summary,
};
}