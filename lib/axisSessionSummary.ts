import type { AxisRep } from "@/lib/axisRepStore";

export type AxisSessionSummary = {
totalReps: number;
rushedEnter: number;
cleanEnter: number;
delayedEnter: number;
rushedGo: number;
cleanGo: number;
delayedGo: number;
shortHold: number;
cleanHold: number;
straightLine: number;
offLine: number;
avgLineScore: number;
avgHoldTime: number;
};

export function emptySessionSummary(): AxisSessionSummary {
return {
totalReps: 0,
rushedEnter: 0,
cleanEnter: 0,
delayedEnter: 0,
rushedGo: 0,
cleanGo: 0,
delayedGo: 0,
shortHold: 0,
cleanHold: 0,
straightLine: 0,
offLine: 0,
avgLineScore: 0,
avgHoldTime: 0,
};
}

export function computeSessionSummary(reps: AxisRep[]): AxisSessionSummary {
if (!reps.length) return emptySessionSummary();

let lineTotal = 0;
let holdTotal = 0;

const summary = emptySessionSummary();
summary.totalReps = reps.length;

for (const rep of reps) {
const { interpretation, metrics } = rep;

if (interpretation.enter === "RUSHED") summary.rushedEnter += 1;
if (interpretation.enter === "CLEAN") summary.cleanEnter += 1;
if (interpretation.enter === "DELAYED") summary.delayedEnter += 1;

if (interpretation.go === "RUSHED") summary.rushedGo += 1;
if (interpretation.go === "CLEAN") summary.cleanGo += 1;
if (interpretation.go === "DELAYED") summary.delayedGo += 1;

if (interpretation.hold === "SHORT") summary.shortHold += 1;
if (interpretation.hold === "CLEAN") summary.cleanHold += 1;

if (interpretation.line === "STRAIGHT") summary.straightLine += 1;
if (interpretation.line === "OFF") summary.offLine += 1;

lineTotal += metrics.lineScore;
holdTotal += metrics.holdTime;
}

summary.avgLineScore = Math.round(lineTotal / reps.length);
summary.avgHoldTime = Math.round(holdTotal / reps.length);

return summary;
}