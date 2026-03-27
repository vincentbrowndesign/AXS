"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Camera from "@/components/axis/Camera";
import PoseOverlay from "@/components/PoseOverlay";
import { interpretAxis } from "@/lib/axis/interpret";
import {
disposeDetector,
estimateSinglePose,
initDetector,
} from "@/lib/detector";

type OverlayPoint = {
x: number;
y: number;
};

function clamp(n: number, min = 0, max = 100) {
return Math.max(min, Math.min(max, n));
}

export default function AxisCameraInstrument() {
const [videoReady, setVideoReady] = useState(false);
const [detectorReady, setDetectorReady] = useState(false);
const [points, setPoints] = useState<OverlayPoint[]>([]);

const [signalValue, setSignalValue] = useState(0);
const [integrityValue, setIntegrityValue] = useState(0);
const [lineScore, setLineScore] = useState(50);
const [timingScore, setTimingScore] = useState(50);

const videoRef = useRef<HTMLVideoElement | null>(null);
const rafRef = useRef<number | null>(null);
const lastTsRef = useRef<number>(0);

const axisState: "NO_TARGET" | "ACTIVE" =
videoReady && points.length > 0 ? "ACTIVE" : "NO_TARGET";

const interpreted = useMemo(() => {
return interpretAxis({
hasTarget: axisState !== "NO_TARGET",
signal: signalValue,
integrity: integrityValue,
line: lineScore,
timing: timingScore,
});
}, [axisState, signalValue, integrityValue, lineScore, timingScore]);

const mapKeypointsToOverlay = useCallback((pose: any): OverlayPoint[] => {
const keypoints = pose?.keypoints ?? [];
return keypoints.map((kp: any) => ({
x: kp?.x ?? 0,
y: kp?.y ?? 0,
}));
}, []);

const deriveSignalMetrics = useCallback((pose: any) => {
const keypoints = pose?.keypoints ?? [];

const valid = keypoints.filter((kp: any) => (kp?.score ?? 0) > 0.2);
const signal = clamp(Math.round((valid.length / 17) * 100));

const leftShoulder = keypoints[5];
const rightShoulder = keypoints[6];
const leftHip = keypoints[11];
const rightHip = keypoints[12];

let integrity = 0;
let line = 50;

const shouldersValid =
leftShoulder &&
rightShoulder &&
(leftShoulder.score ?? 0) > 0.2 &&
(rightShoulder.score ?? 0) > 0.2;

const hipsValid =
leftHip &&
rightHip &&
(leftHip.score ?? 0) > 0.2 &&
(rightHip.score ?? 0) > 0.2;

if (shouldersValid && hipsValid) {
const shoulderTilt = Math.abs(
(leftShoulder.y ?? 0) - (rightShoulder.y ?? 0),
);
const hipTilt = Math.abs((leftHip.y ?? 0) - (rightHip.y ?? 0));

integrity = clamp(100 - Math.round(shoulderTilt + hipTilt));

const shoulderMidX =
((leftShoulder.x ?? 0) + (rightShoulder.x ?? 0)) / 2;
const hipMidX = ((leftHip.x ?? 0) + (rightHip.x ?? 0)) / 2;
const centerOffset = Math.abs(shoulderMidX - hipMidX);

line = clamp(100 - Math.round(centerOffset));
} else {
integrity = clamp(signal - 10);
line = 50;
}

const timing = signal > 70 && integrity > 65 ? 50 : signal < 35 ? 70 : 40;

setSignalValue(signal);
setIntegrityValue(integrity);
setLineScore(line);
setTimingScore(clamp(timing));
}, []);

useEffect(() => {
let mounted = true;

async function boot() {
try {
await initDetector();
if (mounted) setDetectorReady(true);
} catch (error) {
console.error("Detector init failed:", error);
if (mounted) setDetectorReady(false);
}
}

boot();

return () => {
mounted = false;
if (rafRef.current) cancelAnimationFrame(rafRef.current);
disposeDetector().catch(() => {});
};
}, []);

useEffect(() => {
if (!videoReady || !detectorReady || !videoRef.current) return;

const loop = async (ts: number) => {
rafRef.current = requestAnimationFrame(loop);

if (ts - lastTsRef.current < 80) return;
lastTsRef.current = ts;

const video = videoRef.current;
if (!video || video.readyState < 2) return;

try {
const pose = await estimateSinglePose(video);

if (!pose) {
setPoints([]);
setSignalValue(0);
setIntegrityValue(0);
setLineScore(50);
setTimingScore(50);
return;
}

const overlayPoints = mapKeypointsToOverlay(pose);
setPoints(overlayPoints);
deriveSignalMetrics(pose);
} catch (error) {
console.error("Pose estimate failed:", error);
}
};

rafRef.current = requestAnimationFrame(loop);

return () => {
if (rafRef.current) cancelAnimationFrame(rafRef.current);
};
}, [videoReady, detectorReady, mapKeypointsToOverlay, deriveSignalMetrics]);

return (
<div
style={{
background: "#000",
color: "#fff",
fontFamily: "monospace",
minHeight: "100vh",
padding: 20,
display: "grid",
gridTemplateColumns: "320px 1fr",
gap: 20,
}}
>
<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
<div>AXIS v1</div>

<div>
<div style={{ color: "#a1a1aa" }}>STATE</div>
<div style={{ fontSize: 18 }}>{interpreted.state}</div>
</div>

<div>
<div style={{ color: "#a1a1aa" }}>OBSERVATION</div>
{interpreted.observation.map((item) => (
<div key={item}>{item}</div>
))}
</div>

<div>
<div style={{ color: "#a1a1aa" }}>AVAILABLE</div>
{interpreted.availability.map((item) => (
<div key={item}>{item}</div>
))}
</div>

<div>
<div style={{ color: "#a1a1aa" }}>NEXT FIX</div>
<div>{interpreted.nextFix}</div>
</div>

<div>
<div style={{ color: "#a1a1aa" }}>SUMMARY</div>
<div>{interpreted.summary}</div>
</div>

<div style={{ marginTop: 12, color: "#666" }}>
<div>--- DEBUG ---</div>
<div>VIDEO READY: {videoReady ? "YES" : "NO"}</div>
<div>DETECTOR READY: {detectorReady ? "YES" : "NO"}</div>
<div>POINTS: {points.length}</div>
<div>SIGNAL: {signalValue}</div>
<div>INTEGRITY: {integrityValue}</div>
<div>LINE: {lineScore}</div>
<div>TIMING: {timingScore}</div>
</div>
</div>

<div
style={{
position: "relative",
width: "100%",
height: "100vh",
border: "1px solid #1c1c1c",
overflow: "hidden",
background: "#000",
}}
>
<Camera
isActive
onReady={(video) => {
videoRef.current = video;
setVideoReady(true);
}}
/>

<PoseOverlay points={points} width={1280} height={720} />
</div>
</div>
);
}