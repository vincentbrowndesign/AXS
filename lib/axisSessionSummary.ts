import type { AxisRep } from "@/lib/axisRepStore";

export type AxisSessionSummary = {
totalReps: number;

cleanEnter: number;
rushedEnter: number;
delayedEnter: number;

cleanGo: number;
rushedGo: number;
delayedGo: number;

goodHold: number;
shortHold: number;

straightLine: number;
offLine: number;

cleanPct: number;
rushedPct: number;
delayedPct: number;

straightPct: number;
offLinePct: number;

goodHoldPct: number;
shortHoldPct: number;
};

function pct(count: number, total: number) {
if (!total) return 0;
return Math.round((count / total) * 100);
}

export function buildAxisSessionSummary(
reps: AxisRep[],
): AxisSessionSummary {
const summary: AxisSessionSummary = {
totalReps: reps.length,

cleanEnter: 0,
rushedEnter: 0,
delayedEnter: 0,

cleanGo: 0,
rushedGo: 0,
delayedGo: 0,

goodHold: 0,
shortHold: 0,

straightLine: 0,
offLine: 0,

cleanPct: 0,
rushedPct: 0,
delayedPct: 0,

straightPct: 0,
offLinePct: 0,

goodHoldPct: 0,
shortHoldPct: 0,
};

for (const rep of reps) {
const { entry, go, hold, line } = rep;

if (entry === "clean") summary.cleanEnter += 1;
if (entry === "rushed") summary.rushedEnter += 1;
if (entry === "delayed") summary.delayedEnter += 1;

if (go === "clean") summary.cleanGo += 1;
if (go === "rushed") summary.rushedGo += 1;
if (go === "delayed") summary.delayedGo += 1;

if (hold === "good") summary.goodHold += 1;
if (hold === "short") summary.shortHold += 1;

if (line === "straight") summary.straightLine += 1;
if (line === "off") summary.offLine += 1;
}

summary.cleanPct = pct(summary.cleanEnter, summary.totalReps);
summary.rushedPct = pct(summary.rushedEnter, summary.totalReps);
summary.delayedPct = pct(summary.delayedEnter, summary.totalReps);

summary.straightPct = pct(summary.straightLine, summary.totalReps);
summary.offLinePct = pct(summary.offLine, summary.totalReps);

summary.goodHoldPct = pct(summary.goodHold, summary.totalReps);
summary.shortHoldPct = pct(summary.shortHold, summary.totalReps);

return summary;
}