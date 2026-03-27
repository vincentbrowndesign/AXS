type Point = {
x: number;
y: number;
score?: number;
};

export type AxisState =
| "NO_SUBJECT"
| "LOCKING"
| "SET"
| "RISE"
| "RELEASE"
| "LAND";

export type AxisSignal = {
state: AxisState;
signal: number;
lock: number;
center: number;
coverage: number;
motion: number;
shouldersVisible: boolean;
hipsVisible: boolean;
wristHeight: number;
noseHeight: number;
hipHeight: number;
armExtension: number;
verticalLift: number;
};

type PrevFrame = {
centerX: number;
centerY: number;
avgWristY: number;
avgShoulderY: number;
avgHipY: number;
armExtension: number;
state: AxisState;
} | null;

function clamp(value: number, min = 0, max = 100) {
return Math.max(min, Math.min(max, value));
}

function visible(p?: Point | null, minScore = 0.2) {
return (p?.score ?? 0) > minScore;
}

function avg(...values: number[]) {
return values.reduce((a, b) => a + b, 0) / values.length;
}

function dist(a: Point, b: Point) {
const dx = a.x - b.x;
const dy = a.y - b.y;
return Math.sqrt(dx * dx + dy * dy);
}

export function computeAxisSignal(
points: Point[],
width: number,
height: number,
prevFrame: PrevFrame
): { signal: AxisSignal; nextPrev: PrevFrame } {
const nose = points[0];

const ls = points[5];
const rs = points[6];
const le = points[7];
const re = points[8];
const lw = points[9];
const rw = points[10];
const lh = points[11];
const rh = points[12];

const shouldersVisible = visible(ls) && visible(rs);
const hipsVisible = visible(lh) && visible(rh);
const wristsVisible = visible(lw, 0.1) && visible(rw, 0.1);
const elbowsVisible = visible(le, 0.1) && visible(re, 0.1);

const visibleCount = points.filter((p) => (p.score ?? 0) > 0.2).length;
const coverage = clamp((visibleCount / 17) * 100);

if (!shouldersVisible || !hipsVisible) {
return {
signal: {
state: "NO_SUBJECT",
signal: 0,
lock: 0,
center: 0,
coverage,
motion: 0,
shouldersVisible,
hipsVisible,
wristHeight: 0,
noseHeight: 0,
hipHeight: 0,
armExtension: 0,
verticalLift: 0,
},
nextPrev: prevFrame,
};
}

const shoulderCenterX = avg(ls!.x, rs!.x);
const shoulderCenterY = avg(ls!.y, rs!.y);
const hipCenterX = avg(lh!.x, rh!.x);
const hipCenterY = avg(lh!.y, rh!.y);

const cx = avg(shoulderCenterX, hipCenterX);
const cy = avg(shoulderCenterY, hipCenterY);

const dx = Math.abs(cx - width / 2);
const dy = Math.abs(cy - height / 2);

const center = clamp(100 - ((dx / width) * 120 + (dy / height) * 80));

const bodyWidth = Math.abs(rs!.x - ls!.x);
const widthScore = clamp((bodyWidth / (width * 0.25)) * 100);

let motion = 0;
if (prevFrame) {
const mx = cx - prevFrame.centerX;
const my = cy - prevFrame.centerY;
const d = Math.sqrt(mx * mx + my * my);
motion = clamp((d / 25) * 100);
}

const lock = clamp(center * 0.5 + coverage * 0.2 + widthScore * 0.3);
const signal = clamp(lock * 0.6 + coverage * 0.2 + (100 - motion) * 0.2);

const avgWristY =
wristsVisible ? avg(lw!.y, rw!.y) : shoulderCenterY + bodyWidth * 0.3;

const avgHipY = hipCenterY;
const noseHeight = visible(nose, 0.1) ? nose!.y : shoulderCenterY - bodyWidth * 0.25;

const wristHeight = clamp(((avgHipY - avgWristY) / Math.max(40, avgHipY - shoulderCenterY)) * 100);
const hipHeight = clamp(((height - avgHipY) / height) * 100);

let armExtension = 0;
if (wristsVisible && elbowsVisible) {
const leftLen = dist(ls!, le!) + dist(le!, lw!);
const rightLen = dist(rs!, re!) + dist(re!, rw!);
const shoulderSpan = Math.max(1, dist(ls!, rs!));
armExtension = clamp((avg(leftLen, rightLen) / (shoulderSpan * 2.2)) * 100);
}

let verticalLift = 0;
if (prevFrame) {
verticalLift = clamp(((prevFrame.avgWristY - avgWristY) / 20) * 100);
}

let state: AxisState = "LOCKING";

const stable = lock > 70 && motion < 15;
const wristsAboveShoulders = avgWristY < shoulderCenterY;
const wristsNearFace = avgWristY < noseHeight + bodyWidth * 0.5;
const strongLift = verticalLift > 18;
const strongExtension = armExtension > 72;

if (lock < 45) {
state = "LOCKING";
} else if (stable && !wristsAboveShoulders) {
state = "SET";
} else if ((prevFrame?.state === "SET" || prevFrame?.state === "LOCKING") && wristsNearFace && strongLift) {
state = "RISE";
} else if (
(prevFrame?.state === "RISE" || prevFrame?.state === "SET") &&
wristsAboveShoulders &&
strongExtension
) {
state = "RELEASE";
} else if (
prevFrame?.state === "RELEASE" &&
avgWristY > shoulderCenterY &&
motion < 45
) {
state = "LAND";
} else if (motion > 25) {
state = "LOCKING";
} else if (stable) {
state = "SET";
} else {
state = prevFrame?.state === "RELEASE" ? "LAND" : "LOCKING";
}

return {
signal: {
state,
signal,
lock,
center,
coverage,
motion,
shouldersVisible,
hipsVisible,
wristHeight,
noseHeight,
hipHeight,
armExtension,
verticalLift,
},
nextPrev: {
centerX: cx,
centerY: cy,
avgWristY,
avgShoulderY: shoulderCenterY,
avgHipY,
armExtension,
state,
},
};
}