type Point = {
x: number;
y: number;
score?: number;
};

function clamp(value: number, min = 0, max = 100) {
return Math.max(min, Math.min(max, value));
}

export function computeLineScore(points: Point[]) {
const leftShoulder = points[5];
const rightShoulder = points[6];
const leftWrist = points[9];
const rightWrist = points[10];

if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist) {
return 0;
}

const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
const wristCenterX = (leftWrist.x + rightWrist.x) / 2;

const horizontalError = Math.abs(wristCenterX - shoulderCenterX);
const frameWidth = Math.max(
1,
Math.abs(rightShoulder.x - leftShoulder.x) * 3
);

const alignment = 100 - (horizontalError / frameWidth) * 100;

return clamp(alignment);
}