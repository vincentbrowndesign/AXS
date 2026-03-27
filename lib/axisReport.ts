import type { AxisRep } from "@/lib/axisRepStore";
import type { AxisSessionSummary } from "@/lib/axisSessionSummary";

export type AxisReport = {
title: string;
overview: string;
tendencies: string[];
latestRep: string;
coachNote: string;
confidenceNote: string;
};

function topEnter(summary: AxisSessionSummary) {
const pairs = [
["clean", summary.cleanEnter],
["rushed", summary.rushedEnter],
["delayed", summary.delayedEnter],
] as const;

return pairs.sort((a, b) => b[1] - a[1])[0][0];
}

function topGo(summary: AxisSessionSummary) {
const pairs = [
["clean", summary.cleanGo],
["rushed", summary.rushedGo],
["delayed", summary.delayedGo],
] as const;

return pairs.sort((a, b) => b[1] - a[1])[0][0];
}

function latestRepLine(rep: AxisRep | null) {
if (!rep) return "No completed rep yet.";

return `Latest rep: Enter ${rep.interpretation.enter}, Go ${rep.interpretation.go}, Hold ${rep.interpretation.hold}, Line ${rep.interpretation.line}.`;
}

function buildOverview(summary: AxisSessionSummary) {
if (summary.totalReps === 0) {
return "Stand in frame. Earn SET to begin first rep.";
}

return `Session captured ${summary.totalReps} completed reps with an average line score of ${summary.avgLineScore} and an average hold time of ${summary.avgHoldTime} ms.`;
}

function buildTendencies(summary: AxisSessionSummary) {
const tendencies: string[] = [];

if (summary.totalReps === 0) return tendencies;

const enter = topEnter(summary);
const go = topGo(summary);

tendencies.push(`Primary entry tendency: ${enter}.`);
tendencies.push(`Primary go tendency: ${go}.`);

if (summary.shortHold > summary.cleanHold) {
tendencies.push("Finish is breaking short too often.");
} else {
tendencies.push("Finish is mostly being held.");
}

if (summary.offLine > summary.straightLine) {
tendencies.push("Line is drifting more than it is holding straight.");
} else {
tendencies.push("Line is holding mostly straight.");
}

return tendencies;
}

function buildCoachNote(summary: AxisSessionSummary) {
if (summary.totalReps === 0) {
return "First job is to earn full reps consistently.";
}

if (summary.rushedEnter > summary.cleanEnter) {
return "Slow the load. Earn the set before the rep starts climbing.";
}

if (summary.rushedGo > summary.cleanGo) {
return "The rep is breaking early. Let the rise complete before release.";
}

if (summary.shortHold > summary.cleanHold) {
return "Stay through the finish longer. Do not let the rep disappear early.";
}

if (summary.offLine > summary.straightLine) {
return "Keep the wrist path stacked over the center line.";
}

return "The session is trending clean. Repeat the same rhythm and keep stacking clean reps.";
}

function buildConfidenceNote(rep: AxisRep | null) {
if (!rep) {
return "Confidence is low because no completed rep has been captured yet.";
}

if (rep.confidence < 55) {
return "Confidence is low. The system saw the rep, but signal quality was weak.";
}

if (rep.confidence < 80) {
return "Confidence is medium. The system has a usable reading with some noise present.";
}

return "Confidence is high. Signal, gate, and phase integrity were strong.";
}

export function buildReport(
summary: AxisSessionSummary,
latestRep: AxisRep | null
): AxisReport {
return {
title: "AXIS Session Report",
overview: buildOverview(summary),
tendencies: buildTendencies(summary),
latestRep: latestRepLine(latestRep),
coachNote: buildCoachNote(summary),
confidenceNote: buildConfidenceNote(latestRep),
};
}