"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { initDetector } from "@/lib/detector";
import { saveRep } from "@/lib/supabase/saveRep";
import { buildRepPayload } from "@/lib/supabase/buildRepPayload";

type InstrumentMode = "SEARCHING" | "LOCKING" | "READY" | "RESULT";

type AxisState =
| "NO_SUBJECT"
| "SEARCHING"
| "SET"
| "RISE"
| "RELEASE"
| "LAND";

type TruthTag = "RUSHED" | "CLEAN" | "DELAYED";
type CoreTag = "WEAK" | "STABLE" | "STRONG";
type ExitTag = "OFF" | "STRAIGHT";
type IntegrityTag = "BROKEN" | "CONNECTED";

type RepResult = {
id: number;
entry: TruthTag;
core: CoreTag;
exit: ExitTag;
integrity: IntegrityTag;
confidence: number;
holdMs: number;
lineScore: number;
timestamp: number;
axisState: AxisState;
};

type SignalPoint = {
x: number;
y: number;
strength: number;
};

type KeypointLike = {
name?: string;
score?: number;
x: number;
y: number;
};

type PoseLike = {
keypoints: KeypointLike[];
};

type LiveMetrics = {
subjectVisible: boolean;
poseConfidence: number;
coverageScore: number;
centeredScore: number;
integrityScore: number;
signalScore: number;
holdMs: number;
lineScore: number;
releaseDetected: boolean;
};

type RepArc = {
entry: number;
core: number;
exit: number;
integrity: number;
state: AxisState;
};

declare global {
interface Window {
detector?: {
estimatePoses: (video: HTMLVideoElement) => Promise<PoseLike[]>;
dispose?: () => void;
};
}
}

const FIELD_POINTS: SignalPoint[] = [
{ x: 0.58, y: 0.24, strength: 0.9 },
{ x: 0.62, y: 0.2, strength: 0.7 },
{ x: 0.68, y: 0.18, strength: 1.0 },
{ x: 0.73, y: 0.21, strength: 0.8 },
{ x: 0.78, y: 0.24, strength: 0.85 },
];

function clamp(value: number, min: number, max: number) {
return Math.max(min, Math.min(max, value));
}

function formatClock(time: number) {
const d = new Date(time);
return d.toLocaleTimeString([], {
hour: "numeric",
minute: "2-digit",
second: "2-digit",
});
}

function getKeypoint(person: PoseLike, names: string[]) {
return person.keypoints.find((k) => {
const n = k.name?.toLowerCase();
return n ? names.includes(n) : false;
});
}

function getConfidence(person: PoseLike) {
if (!person.keypoints.length) return 0;
const scores = person.keypoints.map((k) => k.score || 0);
return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function getCoverage(person: PoseLike) {
if (!person.keypoints.length) return 0;
const visible = person.keypoints.filter((k) => (k.score || 0) > 0.2).length;
return (visible / person.keypoints.length) * 100;
}

function getCentered(person: PoseLike, frameWidth: number) {
const nose = getKeypoint(person, ["nose"]);
if (!nose) return 0;

const centerX = frameWidth / 2;
const diff = Math.abs(nose.x - centerX);
return clamp(100 - diff / 6, 0, 100);
}

function getIntegrity(person: PoseLike) {
const leftShoulder = getKeypoint(person, ["left_shoulder", "leftshoulder"]);
const rightShoulder = getKeypoint(person, ["right_shoulder", "rightshoulder"]);

if (!leftShoulder || !rightShoulder) return 0;

const width = Math.abs(leftShoulder.x - rightShoulder.x);
return clamp(width / 3, 0, 100);
}

function getLine(person: PoseLike) {
const wrist = getKeypoint(person, ["right_wrist", "rightwrist"]);
const elbow = getKeypoint(person, ["right_elbow", "rightelbow"]);
const shoulder = getKeypoint(person, ["right_shoulder", "rightshoulder"]);

if (!wrist || !elbow || !shoulder) return 0;

const alignment =
Math.abs(wrist.x - elbow.x) + Math.abs(elbow.x - shoulder.x);

return clamp(100 - alignment / 2, 0, 100);
}

function detectRelease(
person: PoseLike,
releaseStateRef: React.MutableRefObject<{ lastWristY: number }>,
) {
const wrist = getKeypoint(person, ["right_wrist", "rightwrist"]);
if (!wrist) return false;

const previousY = releaseStateRef.current.lastWristY;
const velocity = previousY - wrist.y;
releaseStateRef.current.lastWristY = wrist.y;

return velocity > 18 && wrist.y < 300;
}

function getHoldTime(
person: PoseLike,
holdStateRef: React.MutableRefObject<{ holdStart: number; holding: boolean }>,
) {
const wrist = getKeypoint(person, ["right_wrist", "rightwrist"]);
const shoulder = getKeypoint(person, ["right_shoulder", "rightshoulder"]);

if (!wrist || !shoulder) return 0;

const isSet = wrist.y < shoulder.y - 20;

if (isSet) {
if (!holdStateRef.current.holding) {
holdStateRef.current.holding = true;
holdStateRef.current.holdStart = performance.now();
}
} else {
if (holdStateRef.current.holding) {
const duration = performance.now() - holdStateRef.current.holdStart;
holdStateRef.current.holding = false;
return duration;
}
}

if (holdStateRef.current.holding) {
return performance.now() - holdStateRef.current.holdStart;
}

return 0;
}

function getAxisState(metrics: LiveMetrics): AxisState {
if (!metrics.subjectVisible) return "NO_SUBJECT";
if (metrics.poseConfidence < 0.3) return "SEARCHING";
if (metrics.releaseDetected) return "RELEASE";
if (metrics.holdMs > 0 && metrics.signalScore > 40) return "RISE";
if (metrics.holdMs > 0 && !metrics.releaseDetected) return "SET";
return "SEARCHING";
}

function sleep(ms: number) {
return new Promise<void>((resolve) => {
window.setTimeout(resolve, ms);
});
}

export default function Page() {
const [mode, setMode] = useState<InstrumentMode>("SEARCHING");
const [axisState, setAxisState] = useState<AxisState>("NO_SUBJECT");

const [lockStrength, setLockStrength] = useState(0);
const [signalStrength, setSignalStrength] = useState(0);
const [integrity, setIntegrity] = useState(0);
const [sessionConfidence, setSessionConfidence] = useState(0);

const [latestRep, setLatestRep] = useState<RepResult | null>(null);
const [repHistory, setRepHistory] = useState<RepResult[]>([]);
const [showResultFlash, setShowResultFlash] = useState(false);
const [scanPhase, setScanPhase] = useState(0);
const [cameraEnabled, setCameraEnabled] = useState(false);
const [cameraError, setCameraError] = useState<string | null>(null);
const [usingMockSignal, setUsingMockSignal] = useState(true);
const [detectorReady, setDetectorReady] = useState(false);
const [videoReady, setVideoReady] = useState(false);
const [videoSize, setVideoSize] = useState("0x0");
const [saveStatus, setSaveStatus] = useState<
"idle" | "saving" | "saved" | "error"
>("idle");

const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>({
subjectVisible: false,
poseConfidence: 0,
coverageScore: 0,
centeredScore: 0,
integrityScore: 0,
signalScore: 0,
holdMs: 0,
lineScore: 0,
releaseDetected: false,
});

const videoRef = useRef<HTMLVideoElement | null>(null);
const streamRef = useRef<MediaStream | null>(null);
const flashTimeoutRef = useRef<number | null>(null);
const lastReleaseRef = useRef(false);
const poseLoopActiveRef = useRef(false);
const sessionIdRef = useRef(
`session_${new Date().toISOString()}_${Math.random().toString(36).slice(2, 8)}`,
);

const releaseStateRef = useRef({
lastWristY: 0,
});

const holdStateRef = useRef({
holdStart: 0,
holding: false,
});

const repArcRef = useRef<RepArc>({
entry: 0,
core: 0,
exit: 0,
integrity: 0,
state: "NO_SUBJECT",
});

const averages = useMemo(() => {
if (!repHistory.length) {
return {
confidence: 0,
cleanPct: 0,
straightPct: 0,
connectedPct: 0,
};
}

const confidence = Math.round(
repHistory.reduce((sum, rep) => sum + rep.confidence, 0) / repHistory.length,
);

const cleanPct = Math.round(
(repHistory.filter((rep) => rep.entry === "CLEAN").length / repHistory.length) *
100,
);

const straightPct = Math.round(
(repHistory.filter((rep) => rep.exit === "STRAIGHT").length / repHistory.length) *
100,
);

const connectedPct = Math.round(
(repHistory.filter((rep) => rep.integrity === "CONNECTED").length /
repHistory.length) *
100,
);

return {
confidence,
cleanPct,
straightPct,
connectedPct,
};
}, [repHistory]);

useEffect(() => {
initDetector()
.then(() => setDetectorReady(true))
.catch((error) => {
console.error("Detector init failed:", error);
setDetectorReady(false);
});
}, []);

useEffect(() => {
return () => {
if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
if (streamRef.current) {
streamRef.current.getTracks().forEach((track) => track.stop());
}
};
}, []);

useEffect(() => {
if (!repHistory.length) {
setSessionConfidence(0);
return;
}

const avg = Math.round(
repHistory.reduce((sum, rep) => sum + rep.confidence, 0) / repHistory.length,
);
setSessionConfidence(avg);
}, [repHistory]);

useEffect(() => {
if (!usingMockSignal) return;

const id = window.setInterval(() => {
setScanPhase((current) => (current + 1) % 100);

const subjectVisible = Math.random() > 0.08;
const poseConfidence = subjectVisible ? 0.5 + Math.random() * 0.35 : 0;
const coverageScore = subjectVisible ? 48 + Math.random() * 32 : 0;
const centeredScore = subjectVisible ? 42 + Math.random() * 42 : 0;
const integrityScore = subjectVisible ? 50 + Math.random() * 40 : 0;
const signalScore = subjectVisible ? 42 + Math.random() * 38 : 0;
const holdMs = subjectVisible ? 80 + Math.random() * 280 : 0;
const lineScore = subjectVisible ? 50 + Math.random() * 40 : 0;
const releaseDetected = subjectVisible && Math.random() > 0.985;

setLiveMetrics({
subjectVisible,
poseConfidence,
coverageScore: Math.round(coverageScore),
centeredScore: Math.round(centeredScore),
integrityScore: Math.round(integrityScore),
signalScore: Math.round(signalScore),
holdMs: Math.round(holdMs),
lineScore: Math.round(lineScore),
releaseDetected,
});
}, 80);

return () => window.clearInterval(id);
}, [usingMockSignal]);

useEffect(() => {
const id = window.setInterval(() => {
setScanPhase((current) => (current + 1) % 100);

const nextLock = Math.round(
clamp(
liveMetrics.poseConfidence * 42 +
liveMetrics.coverageScore * 0.32 +
liveMetrics.centeredScore * 0.26,
0,
100,
),
);

const nextSignal = Math.round(clamp(liveMetrics.signalScore, 0, 100));
const nextIntegrity = Math.round(clamp(liveMetrics.integrityScore, 0, 100));

const nextAxisState = getAxisState(liveMetrics);

setLockStrength(nextLock);
setSignalStrength(nextSignal);
setIntegrity(nextIntegrity);
setAxisState(nextAxisState);

repArcRef.current = {
entry: liveMetrics.centeredScore,
core: liveMetrics.signalScore,
exit: liveMetrics.lineScore,
integrity: liveMetrics.integrityScore,
state: nextAxisState,
};

if (showResultFlash) return;

if (!liveMetrics.subjectVisible || nextLock < 22) {
setMode("SEARCHING");
} else if (nextLock < 48) {
setMode("LOCKING");
} else {
setMode("READY");
}
}, 80);

return () => window.clearInterval(id);
}, [liveMetrics, showResultFlash]);

useEffect(() => {
if (liveMetrics.releaseDetected && !lastReleaseRef.current) {
void captureRepFromLive(true);
}

lastReleaseRef.current = liveMetrics.releaseDetected;
}, [
liveMetrics.releaseDetected,
liveMetrics.holdMs,
liveMetrics.lineScore,
axisState,
lockStrength,
signalStrength,
integrity,
]);

useEffect(() => {
if (!cameraEnabled) return;
if (!videoReady) return;
if (usingMockSignal) return;
if (!videoRef.current) return;
if (!window.detector) return;
if (poseLoopActiveRef.current) return;

let running = true;
poseLoopActiveRef.current = true;

const runPoseLoop = async () => {
while (running) {
try {
const video = videoRef.current;
const detector = window.detector;

if (!video || !detector || video.readyState < 2) {
await sleep(60);
continue;
}

const poses = await detector.estimatePoses(video);
const person = poses?.[0];

if (!person) {
holdStateRef.current.holding = false;

setLiveMetrics({
subjectVisible: false,
poseConfidence: 0,
coverageScore: 0,
centeredScore: 0,
integrityScore: 0,
signalScore: 0,
holdMs: 0,
lineScore: 0,
releaseDetected: false,
});

await sleep(60);
continue;
}

const poseConfidence = getConfidence(person);
const coverageScore = getCoverage(person);
const centeredScore = getCentered(person, video.videoWidth || 1280);
const integrityScore = getIntegrity(person);
const holdMs = getHoldTime(person, holdStateRef);
const lineScore = getLine(person);
const releaseDetected = detectRelease(person, releaseStateRef);

setLiveMetrics({
subjectVisible: true,
poseConfidence,
coverageScore: Math.round(coverageScore),
centeredScore: Math.round(centeredScore),
integrityScore: Math.round(integrityScore),
signalScore: Math.round(clamp(poseConfidence * 100, 0, 100)),
holdMs: Math.round(holdMs),
lineScore: Math.round(lineScore),
releaseDetected,
});

await sleep(60);
} catch (error) {
console.error("Pose loop error:", error);
await sleep(120);
}
}
};

void runPoseLoop();

return () => {
running = false;
poseLoopActiveRef.current = false;
};
}, [cameraEnabled, videoReady, usingMockSignal]);

async function persistRep(rep: RepResult) {
try {
setSaveStatus("saving");

const payload = buildRepPayload({
sessionId: sessionIdRef.current,
axisState: rep.axisState,
lockScore: lockStrength,
signalScore: signalStrength,
integrityScore: integrity,
sessionScore: sessionConfidence,
latestRep: {
entry: rep.entry,
core: rep.core,
exit: rep.exit,
confidence: rep.confidence,
line: rep.lineScore,
timing: rep.holdMs,
integrity: rep.integrity,
timestamp: rep.timestamp,
},
});

const saved = await saveRep(payload);
console.log("Saved:", saved);

setSaveStatus("saved");
window.setTimeout(() => {
setSaveStatus((current) => (current === "saved" ? "idle" : current));
}, 1200);
} catch (error) {
console.error("Failed to save rep:", error);
setSaveStatus("error");
}
}

async function startCamera() {
try {
setCameraError(null);
setVideoReady(false);
setVideoSize("0x0");
setLatestRep(null);
setRepHistory([]);
setSessionConfidence(0);
setMode("SEARCHING");
setAxisState("NO_SUBJECT");
setSaveStatus("idle");
sessionIdRef.current = `session_${new Date().toISOString()}_${Math.random()
.toString(36)
.slice(2, 8)}`;

await initDetector();
setDetectorReady(true);

const stream = await navigator.mediaDevices.getUserMedia({
video: {
width: { ideal: 1280 },
height: { ideal: 720 },
facingMode: "user",
},
audio: false,
});

streamRef.current = stream;
setCameraEnabled(true);

await new Promise<void>((resolve) => {
requestAnimationFrame(() => resolve());
});

const v = videoRef.current;
if (!v) {
throw new Error("Video element not available.");
}

v.srcObject = stream;
await v.play();

setVideoReady(true);
setVideoSize(`${v.videoWidth || 0}x${v.videoHeight || 0}`);
setUsingMockSignal(false);
} catch (error) {
console.error(error);
setCameraEnabled(false);
setUsingMockSignal(true);
setVideoReady(false);
setVideoSize("0x0");
setCameraError("Camera failed to start.");
}
}

function stopCamera() {
if (streamRef.current) {
streamRef.current.getTracks().forEach((track) => track.stop());
streamRef.current = null;
}

if (videoRef.current) {
videoRef.current.pause();
videoRef.current.srcObject = null;
}

holdStateRef.current.holding = false;
releaseStateRef.current.lastWristY = 0;

setCameraEnabled(false);
setVideoReady(false);
setVideoSize("0x0");
setUsingMockSignal(true);
}

async function captureRepFromLive(shouldPersist = false) {
const arc = repArcRef.current;

const entry: TruthTag =
arc.entry < 40 ? "RUSHED" : arc.entry > 80 ? "DELAYED" : "CLEAN";

const core: CoreTag =
arc.core < 40 ? "WEAK" : arc.core > 75 ? "STRONG" : "STABLE";

const exit: ExitTag = arc.exit < 60 ? "OFF" : "STRAIGHT";

const integrityTag: IntegrityTag =
arc.integrity < 50 ? "BROKEN" : "CONNECTED";

const confidence = Math.round(
clamp(
arc.entry * 0.2 +
arc.core * 0.3 +
arc.exit * 0.3 +
arc.integrity * 0.2,
0,
100,
),
);

const rep: RepResult = {
id: Date.now(),
entry,
core,
exit,
integrity: integrityTag,
confidence,
holdMs: Math.round(liveMetrics.holdMs),
lineScore: Math.round(liveMetrics.lineScore),
timestamp: Date.now(),
axisState: arc.state,
};

setLatestRep(rep);
setRepHistory((prev) => [rep, ...prev].slice(0, 10));
setMode("RESULT");
setShowResultFlash(true);

if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
flashTimeoutRef.current = window.setTimeout(() => {
setShowResultFlash(false);

if (!liveMetrics.subjectVisible || lockStrength < 22) {
setMode("SEARCHING");
} else if (lockStrength < 48) {
setMode("LOCKING");
} else {
setMode("READY");
}
}, 650);

if (shouldPersist) {
await persistRep(rep);
}
}

function resetSession() {
setLatestRep(null);
setRepHistory([]);
setSessionConfidence(0);
setMode("SEARCHING");
setAxisState("NO_SUBJECT");
setSaveStatus("idle");
sessionIdRef.current = `session_${new Date().toISOString()}_${Math.random()
.toString(36)
.slice(2, 8)}`;
}

const dominantLabel = (() => {
if (showResultFlash && latestRep) {
return `${latestRep.entry} • ${latestRep.exit}`;
}
if (mode === "SEARCHING") return "NO TARGET";
if (mode === "LOCKING") return "LOCKING";
if (mode === "READY") return "READY";
return "RESULT";
})();

return (
<main className="min-h-screen bg-[#050505] text-[#f3f3ee]">
<div className="relative h-screen w-full overflow-hidden">
<div className="absolute inset-0 z-0 bg-black">
<video
ref={videoRef}
className={`h-full w-full object-cover transition-opacity duration-200 ${
cameraEnabled ? "opacity-100" : "opacity-0"
}`}
playsInline
muted
autoPlay
onLoadedMetadata={() => {
const v = videoRef.current;
if (!v) return;
setVideoReady(true);
setVideoSize(`${v.videoWidth || 0}x${v.videoHeight || 0}`);
}}
/>
</div>

<div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02),transparent_48%)]" />

<div
className="absolute inset-0 opacity-10"
style={{
backgroundImage:
"linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
backgroundSize: "64px 64px",
transform: "scale(1.02) rotate(-0.15deg)",
}}
/>

<div
className="pointer-events-none absolute inset-y-0 left-0 w-[28%]"
style={{
opacity: 0.08,
background:
"linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 38%, rgba(255,255,255,0.00) 100%)",
}}
/>

<div className="pointer-events-none absolute inset-0">
<div
className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10"
style={{ boxShadow: "0 0 90px rgba(255,255,255,0.03) inset" }}
/>
<div className="absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
<div className="absolute left-1/2 top-1/2 h-[8rem] w-[8rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />

<div className="absolute left-1/2 top-1/2 h-[36rem] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-white/10" />
<div className="absolute left-1/2 top-1/2 h-[2px] w-[36rem] -translate-x-1/2 -translate-y-1/2 bg-white/10" />

<div
className="absolute left-1/2 top-1/2 h-[19rem] w-[19rem] -translate-x-1/2 -translate-y-1/2 rounded-full border"
style={{
borderColor:
lockStrength >= 48
? "rgba(57,255,20,0.8)"
: "rgba(255,255,255,0.18)",
boxShadow:
lockStrength >= 48
? "0 0 28px rgba(57,255,20,0.28), inset 0 0 28px rgba(57,255,20,0.08)"
: "0 0 18px rgba(255,255,255,0.06)",
transform: `translate(-50%, -50%) scale(${0.96 + lockStrength / 800})`,
transition: "all 120ms linear",
}}
/>

<div
className="absolute top-[10%] h-[80%] w-[2px] bg-gradient-to-b from-transparent via-[#39FF14] to-transparent opacity-75"
style={{
left: `${8 + scanPhase * 0.84}%`,
boxShadow: "0 0 18px rgba(57,255,20,0.4)",
transition: "left 120ms linear",
}}
/>

{FIELD_POINTS.map((point, index) => {
const pulse = 1 + Math.sin((scanPhase + index * 13) / 8) * 0.18;

return (
<div
key={`${point.x}-${point.y}`}
className="absolute rounded-full bg-[#ff4d4d]"
style={{
left: `${point.x * 100}%`,
top: `${point.y * 100}%`,
width: `${8 + point.strength * 4}px`,
height: `${8 + point.strength * 4}px`,
transform: `translate(-50%, -50%) scale(${pulse})`,
boxShadow: "0 0 18px rgba(255,77,77,0.55)",
opacity: 0.95,
}}
/>
);
})}
</div>

<section className="absolute left-0 top-0 flex h-full w-full">
<div className="flex w-[26rem] flex-col justify-between p-6 md:p-8">
<div className="space-y-6">
<div className="space-y-3">
<div className="h-[6px] w-32 bg-white/15">
<div
className="h-full bg-[#39FF14] transition-all duration-150"
style={{ width: `${clamp(lockStrength, 6, 100)}%` }}
/>
</div>
<div className="h-[6px] w-28 bg-white/10">
<div
className="h-full bg-white/40 transition-all duration-150"
style={{ width: `${clamp(signalStrength, 4, 100)}%` }}
/>
</div>
<div className="h-[6px] w-24 bg-white/10">
<div
className="h-full bg-white/25 transition-all duration-150"
style={{ width: `${clamp(integrity, 4, 100)}%` }}
/>
</div>
</div>

<div className="space-y-3">
<div className="text-[11px] uppercase tracking-[0.35em] text-white/45">
AXIS v2
</div>

<div
className="text-4xl font-semibold tracking-tight text-white"
style={{
textShadow: showResultFlash
? "0 0 22px rgba(57,255,20,0.28)"
: "none",
}}
>
{dominantLabel}
</div>

<div className="max-w-[18rem] text-sm leading-6 text-white/60">
{showResultFlash && latestRep ? (
<>
ENTRY {latestRep.entry} • CORE {latestRep.core} • EXIT{" "}
{latestRep.exit} • LINK {latestRep.integrity}
</>
) : mode === "SEARCHING" ? (
"Acquire body. Enter frame. Stabilize signal."
) : mode === "LOCKING" ? (
"Structure rising. Hold body inside field."
) : (
"Signal stable. Ready for first rep."
)}
</div>

<div className="text-xs uppercase tracking-[0.28em] text-white/35">
STATE: {axisState}
</div>
</div>

<div className="grid grid-cols-2 gap-3 text-sm">
<MetricCard
label="LOCK"
value={lockStrength}
tone={lockStrength >= 48 ? "hot" : "cold"}
/>
<MetricCard
label="SIGNAL"
value={signalStrength}
tone={signalStrength >= 42 ? "hot" : "cold"}
/>
<MetricCard
label="INTEGRITY"
value={integrity}
tone={integrity >= 42 ? "hot" : "cold"}
/>
<MetricCard
label="SESSION"
value={sessionConfidence}
tone={sessionConfidence >= 55 ? "hot" : "cold"}
/>
</div>
</div>

<div className="space-y-3">
<div className="text-[11px] uppercase tracking-[0.35em] text-white/35">
LIVE CONTROLS
</div>

<div className="flex flex-wrap gap-2">
<button
onClick={() => void captureRepFromLive(true)}
className="border border-white/15 bg-white/6 px-4 py-2 text-sm text-white transition hover:border-[#39FF14]/50 hover:bg-white/10"
>
{saveStatus === "saving" ? "SAVING..." : "MARK REP"}
</button>

<button
onClick={resetSession}
className="border border-white/10 px-4 py-2 text-sm text-white/75 transition hover:bg-white/6"
>
RESET
</button>

{!cameraEnabled ? (
<button
onClick={() => void startCamera()}
className="border border-white/10 px-4 py-2 text-sm text-white/75 transition hover:bg-white/6"
>
CAMERA
</button>
) : (
<button
onClick={stopCamera}
className="border border-white/10 px-4 py-2 text-sm text-white/75 transition hover:bg-white/6"
>
CAMERA OFF
</button>
)}

<button
onClick={() => {
const next = !usingMockSignal;
setUsingMockSignal(next);
if (next) {
setVideoReady(false);
setVideoSize("0x0");
}
}}
className="border border-white/10 px-4 py-2 text-sm text-white/75 transition hover:bg-white/6"
>
MOCK {usingMockSignal ? "ON" : "OFF"}
</button>
</div>

<div className="text-xs text-white/35">
Save:{" "}
<span className="text-white">
{saveStatus === "idle" && "IDLE"}
{saveStatus === "saving" && "SAVING"}
{saveStatus === "saved" && "SAVED"}
{saveStatus === "error" && "ERROR"}
</span>
</div>

{cameraError ? (
<div className="text-xs text-white/40">{cameraError}</div>
) : null}

<div className="text-xs text-white/35">
Detector:{" "}
<span className="text-white">
{detectorReady ? "READY" : "LOADING"}
</span>
</div>

<div className="text-xs text-white/35">
Video:{" "}
<span className="text-white">
{videoReady ? `LIVE ${videoSize}` : "NOT READY"}
</span>
</div>

<div className="text-xs text-white/35">
Mock:{" "}
<span className="text-white">
{usingMockSignal ? "ON" : "OFF"}
</span>
</div>
</div>
</div>

<div className="ml-auto flex w-[24rem] flex-col justify-between border-l border-white/8 bg-black/10 p-6 md:p-8 backdrop-blur-[2px]">
<div className="space-y-5">
<div>
<div className="text-[11px] uppercase tracking-[0.35em] text-white/35">
LATEST REP
</div>

<div className="mt-3 border border-white/10 p-4">
{latestRep ? (
<div className="space-y-3">
<div className="text-xl font-semibold text-white">
ENTRY {latestRep.entry}
</div>

<div className="grid grid-cols-2 gap-y-2 text-sm text-white/60">
<span>Core</span>
<span className="text-right text-white">
{latestRep.core}
</span>

<span>Exit</span>
<span className="text-right text-white">
{latestRep.exit}
</span>

<span>Link</span>
<span className="text-right text-white">
{latestRep.integrity}
</span>

<span>Confidence</span>
<span className="text-right text-white">
{latestRep.confidence}
</span>

<span>Hold</span>
<span className="text-right text-white">
{latestRep.holdMs}ms
</span>

<span>Line</span>
<span className="text-right text-white">
{latestRep.lineScore}
</span>

<span>State</span>
<span className="text-right text-white">
{latestRep.axisState}
</span>

<span>Time</span>
<span className="text-right text-white">
{formatClock(latestRep.timestamp)}
</span>
</div>
</div>
) : (
<div className="text-sm leading-6 text-white/50">
No completed rep yet. Stand in frame. Lock body. Mark
first rep.
</div>
)}
</div>
</div>

<div>
<div className="text-[11px] uppercase tracking-[0.35em] text-white/35">
SESSION REPORT
</div>

<div className="mt-3 space-y-3 border border-white/10 p-4 text-sm text-white/65">
<Row label="Total reps" value={String(repHistory.length)} />
<Row label="Avg confidence" value={`${averages.confidence}`} />
<Row label="Clean" value={`${averages.cleanPct}%`} />
<Row label="Straight" value={`${averages.straightPct}%`} />
<Row label="Connected" value={`${averages.connectedPct}%`} />
</div>
</div>
</div>

<div>
<div className="mb-3 text-[11px] uppercase tracking-[0.35em] text-white/35">
REP HISTORY
</div>

<div className="space-y-2">
{repHistory.length ? (
repHistory.map((rep) => (
<div
key={rep.id}
className="border border-white/10 px-3 py-2 text-sm"
>
<div className="flex items-center justify-between">
<div className="text-white">
{rep.entry} / {rep.exit}
</div>
<div className="text-white/45">{rep.confidence}</div>
</div>

<div className="mt-1 text-xs text-white/40">
core {rep.core} • link {rep.integrity}
</div>
</div>
))
) : (
<div className="border border-white/10 px-3 py-4 text-sm text-white/40">
Session waiting.
</div>
)}
</div>
</div>
</div>
</section>
</div>
</main>
);
}

function MetricCard({
label,
value,
tone,
}: {
label: string;
value: number;
tone: "hot" | "cold";
}) {
return (
<div className="border border-white/10 bg-white/[0.02] p-3">
<div className="text-[10px] uppercase tracking-[0.25em] text-white/35">
{label}
</div>
<div
className="mt-2 text-2xl font-semibold"
style={{ color: tone === "hot" ? "#39FF14" : "rgba(255,255,255,0.92)" }}
>
{value}
</div>
</div>
);
}

function Row({ label, value }: { label: string; value: string }) {
return (
<div className="flex items-center justify-between">
<span>{label}</span>
<span className="text-white">{value}</span>
</div>
);
}