"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { initDetector } from "@/lib/detector";
import { saveRep } from "@/lib/supabase/saveRep";
import { buildRepPayload } from "@/lib/supabase/buildRepPayload";

type InstrumentMode = "WAITING" | "ACQUIRING" | "LOCKED" | "TRACKING" | "RESULT";

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
{ x: 0.18, y: 0.22, strength: 0.7 },
{ x: 0.26, y: 0.18, strength: 0.55 },
{ x: 0.72, y: 0.16, strength: 0.65 },
{ x: 0.81, y: 0.24, strength: 0.9 },
{ x: 0.68, y: 0.76, strength: 0.5 },
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

function formatMs(ms: number) {
return `${Math.round(ms)}ms`;
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
} else if (holdStateRef.current.holding) {
const duration = performance.now() - holdStateRef.current.holdStart;
holdStateRef.current.holding = false;
return duration;
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

function getInstrumentMode(
metrics: LiveMetrics,
lockStrength: number,
showResultFlash: boolean,
): InstrumentMode {
if (showResultFlash) return "RESULT";
if (!metrics.subjectVisible) return "WAITING";
if (lockStrength < 48) return "ACQUIRING";
if (metrics.releaseDetected || metrics.holdMs > 0) return "TRACKING";
return "LOCKED";
}

function sleep(ms: number) {
return new Promise<void>((resolve) => {
window.setTimeout(resolve, ms);
});
}

export default function Page() {
const [mode, setMode] = useState<InstrumentMode>("WAITING");
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
let mounted = true;

initDetector()
.then(() => {
if (mounted) setDetectorReady(true);
})
.catch((error) => {
console.error("Detector init failed:", error);
if (mounted) setDetectorReady(false);
});

return () => {
mounted = false;
};
}, []);

useEffect(() => {
return () => {
if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
if (streamRef.current) {
streamRef.current.getTracks().forEach((track) => track.stop());
}
window.detector?.dispose?.();
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
const nextMode = getInstrumentMode(liveMetrics, nextLock, showResultFlash);

setLockStrength(nextLock);
setSignalStrength(nextSignal);
setIntegrity(nextIntegrity);
setAxisState(nextAxisState);
setMode(nextMode);

repArcRef.current = {
entry: liveMetrics.centeredScore,
core: liveMetrics.signalScore,
exit: liveMetrics.lineScore,
integrity: liveMetrics.integrityScore,
state: nextAxisState,
};
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

await saveRep(payload);

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
setMode("WAITING");
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
setRepHistory((prev) => [rep, ...prev].slice(0, 12));
setShowResultFlash(true);
setMode("RESULT");

if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
flashTimeoutRef.current = window.setTimeout(() => {
setShowResultFlash(false);
}, 650);

if (shouldPersist) {
await persistRep(rep);
}
}

function resetSession() {
setLatestRep(null);
setRepHistory([]);
setSessionConfidence(0);
setMode("WAITING");
setAxisState("NO_SUBJECT");
setSaveStatus("idle");
sessionIdRef.current = `session_${new Date().toISOString()}_${Math.random()
.toString(36)
.slice(2, 8)}`;
}

const modeLabel = (() => {
if (mode === "WAITING") return "WAITING";
if (mode === "ACQUIRING") return "ACQUIRING";
if (mode === "LOCKED") return "LOCKED";
if (mode === "TRACKING") return "TRACKING";
return "RESULT";
})();

const dominantLabel = (() => {
if (showResultFlash && latestRep) {
return `${latestRep.entry} • ${latestRep.exit}`;
}
if (mode === "WAITING") return "NO TARGET";
if (mode === "ACQUIRING") return "ACQUIRE";
if (mode === "LOCKED") return "READY";
if (mode === "TRACKING") return "TRACKING";
return "RESULT";
})();

const modeCopy = (() => {
if (showResultFlash && latestRep) {
return `ENTRY ${latestRep.entry} • CORE ${latestRep.core} • EXIT ${latestRep.exit} • LINK ${latestRep.integrity}`;
}
if (mode === "WAITING") return "Bring body into field. Establish baseline.";
if (mode === "ACQUIRING") return "Scene is stabilizing. Hold center and let lock rise.";
if (mode === "LOCKED") return "Measurement ready. Field stable. Await first rep.";
if (mode === "TRACKING") return "Event window open. Preserve line and hold.";
return "Rep reconstructed.";
})();

const saveTone =
saveStatus === "saved"
? "text-[#7CFF6B]"
: saveStatus === "saving"
? "text-[#FFD84D]"
: saveStatus === "error"
? "text-[#FF6262]"
: "text-white/55";

return (
<main className="min-h-screen bg-[#060606] text-[#F3F5F7]">
<div className="relative h-screen w-full overflow-hidden bg-black">
<video
ref={videoRef}
className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
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

<div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.025),transparent_52%)]" />
<div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.16),rgba(0,0,0,0.52))]" />

<div
className="absolute inset-0 opacity-[0.08]"
style={{
backgroundImage:
"linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
backgroundSize: "56px 56px",
}}
/>

<div className="pointer-events-none absolute inset-0">
<div className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
<div className="absolute left-1/2 top-1/2 h-[21rem] w-[21rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
<div className="absolute left-1/2 top-1/2 h-[9rem] w-[9rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
<div className="absolute left-1/2 top-1/2 h-[2px] w-[36rem] -translate-x-1/2 -translate-y-1/2 bg-white/10" />
<div className="absolute left-1/2 top-1/2 h-[36rem] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-white/10" />

<div
className="absolute left-1/2 top-1/2 h-[19rem] w-[19rem] -translate-x-1/2 -translate-y-1/2 rounded-full border transition-all duration-150"
style={{
borderColor:
lockStrength >= 48
? "rgba(124,255,107,0.88)"
: "rgba(255,255,255,0.18)",
boxShadow:
lockStrength >= 48
? "0 0 30px rgba(124,255,107,0.18), inset 0 0 30px rgba(124,255,107,0.08)"
: "0 0 14px rgba(255,255,255,0.04)",
transform: `translate(-50%, -50%) scale(${0.96 + lockStrength / 900})`,
}}
/>

<div
className="absolute top-[10%] h-[80%] w-[2px] bg-gradient-to-b from-transparent via-[#7CFF6B] to-transparent opacity-80"
style={{
left: `${8 + scanPhase * 0.84}%`,
boxShadow: "0 0 18px rgba(124,255,107,0.4)",
transition: "left 120ms linear",
}}
/>

{FIELD_POINTS.map((point, index) => {
const pulse = 1 + Math.sin((scanPhase + index * 13) / 8) * 0.18;
return (
<div
key={`${point.x}-${point.y}`}
className="absolute rounded-full bg-[#FF6262]"
style={{
left: `${point.x * 100}%`,
top: `${point.y * 100}%`,
width: `${8 + point.strength * 4}px`,
height: `${8 + point.strength * 4}px`,
transform: `translate(-50%, -50%) scale(${pulse})`,
boxShadow: "0 0 18px rgba(255,98,98,0.4)",
}}
/>
);
})}
</div>

<div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4 md:p-6">
<div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md">
<div className="text-[10px] uppercase tracking-[0.34em] text-white/45">
AXIS v2
</div>
<div className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-4xl">
{dominantLabel}
</div>
<div className="mt-2 max-w-[18rem] text-xs leading-5 text-white/60 md:text-sm">
{modeCopy}
</div>
</div>

<div className="hidden gap-3 md:flex">
<TopChip label="MODE" value={modeLabel} active={mode !== "WAITING"} />
<TopChip label="STATE" value={axisState} active={axisState !== "NO_SUBJECT"} />
<TopChip label="SAVE" value={saveStatus.toUpperCase()} active={saveStatus === "saved"} />
</div>
</div>

<div className="absolute left-4 top-[8.7rem] z-10 hidden w-[18rem] space-y-3 md:block">
<MetricRail label="LOCK" value={lockStrength} accent={lockStrength >= 48} />
<MetricRail label="SIGNAL" value={signalStrength} accent={signalStrength >= 42} />
<MetricRail label="INTEGRITY" value={integrity} accent={integrity >= 42} />
<MetricRail label="SESSION" value={sessionConfidence} accent={sessionConfidence >= 55} />
</div>

<div className="absolute bottom-4 left-4 right-4 z-10 md:left-6 md:right-6 md:bottom-6">
<div className="grid gap-4 xl:grid-cols-[1.35fr,0.95fr]">
<div className="rounded-[28px] border border-white/10 bg-black/45 p-4 backdrop-blur-md md:p-5">
<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
<div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
<StatCard
label="LOCK"
value={String(lockStrength)}
foot="capture confidence"
active={lockStrength >= 48}
/>
<StatCard
label="SIGNAL"
value={String(signalStrength)}
foot="movement certainty"
active={signalStrength >= 42}
/>
<StatCard
label="HOLD"
value={formatMs(liveMetrics.holdMs)}
foot="active window"
active={liveMetrics.holdMs > 0}
/>
<StatCard
label="LINE"
value={String(Math.round(liveMetrics.lineScore))}
foot="direction integrity"
active={liveMetrics.lineScore >= 60}
/>
</div>

<div className="flex flex-wrap gap-2">
<ControlButton
onClick={() => void captureRepFromLive(true)}
variant="primary"
>
{saveStatus === "saving" ? "SAVING…" : "MARK REP"}
</ControlButton>

<ControlButton onClick={resetSession}>RESET</ControlButton>

{!cameraEnabled ? (
<ControlButton onClick={() => void startCamera()}>
CAMERA
</ControlButton>
) : (
<ControlButton onClick={stopCamera}>CAMERA OFF</ControlButton>
)}

<ControlButton
onClick={() => {
const next = !usingMockSignal;
setUsingMockSignal(next);
if (next) {
setVideoReady(false);
setVideoSize("0x0");
}
}}
>
MOCK {usingMockSignal ? "ON" : "OFF"}
</ControlButton>
</div>
</div>

<div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.24em] text-white/45">
<span>
Detector{" "}
<b className="font-medium text-white">
{detectorReady ? "READY" : "LOADING"}
</b>
</span>
<span>
Video{" "}
<b className="font-medium text-white">
{videoReady ? `LIVE ${videoSize}` : "NOT READY"}
</b>
</span>
<span>
Mock{" "}
<b className="font-medium text-white">
{usingMockSignal ? "ON" : "OFF"}
</b>
</span>
<span className={saveTone}>
Save <b className="font-medium text-current">{saveStatus.toUpperCase()}</b>
</span>
{cameraError ? <span className="text-[#FF6262]">{cameraError}</span> : null}
</div>
</div>

<div className="rounded-[28px] border border-white/10 bg-black/45 p-4 backdrop-blur-md md:p-5">
<div className="grid gap-4 md:grid-cols-[0.9fr,1.1fr]">
<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
<div className="text-[10px] uppercase tracking-[0.34em] text-white/40">
Latest rep
</div>

{latestRep ? (
<>
<div className="mt-3 text-2xl font-semibold text-white">
{latestRep.entry}
</div>
<div className="mt-3 space-y-2 text-sm text-white/62">
<MiniRow label="Core" value={latestRep.core} />
<MiniRow label="Exit" value={latestRep.exit} />
<MiniRow label="Link" value={latestRep.integrity} />
<MiniRow label="Confidence" value={String(latestRep.confidence)} />
<MiniRow label="Hold" value={formatMs(latestRep.holdMs)} />
<MiniRow label="Time" value={formatClock(latestRep.timestamp)} />
</div>
</>
) : (
<div className="mt-3 text-sm leading-6 text-white/45">
No completed rep yet. Acquire lock, open the field, then mark the event.
</div>
)}
</div>

<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
<div className="text-[10px] uppercase tracking-[0.34em] text-white/40">
Session report
</div>

<div className="mt-3 grid grid-cols-2 gap-3">
<ReportCard label="TOTAL" value={String(repHistory.length)} />
<ReportCard label="AVG" value={String(averages.confidence)} />
<ReportCard label="CLEAN" value={`${averages.cleanPct}%`} />
<ReportCard label="STRAIGHT" value={`${averages.straightPct}%`} />
</div>

<div className="mt-4 text-xs uppercase tracking-[0.24em] text-white/42">
Review stack
</div>

<div className="mt-2 max-h-[10rem] space-y-2 overflow-auto pr-1">
{repHistory.length ? (
repHistory.map((rep) => (
<div
key={rep.id}
className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2"
>
<div>
<div className="text-sm text-white">
{rep.entry} / {rep.exit}
</div>
<div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
{rep.core} • {rep.integrity}
</div>
</div>
<div className="text-sm text-white/65">{rep.confidence}</div>
</div>
))
) : (
<div className="rounded-xl border border-white/10 bg-black/30 px-3 py-4 text-sm text-white/40">
Session waiting.
</div>
)}
</div>
</div>
</div>
</div>
</div>
</div>

<div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/65 to-transparent" />
</div>
</main>
);
}

function TopChip({
label,
value,
active,
}: {
label: string;
value: string;
active?: boolean;
}) {
return (
<div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md">
<div className="text-[10px] uppercase tracking-[0.28em] text-white/40">
{label}
</div>
<div
className={`mt-2 text-sm font-medium ${
active ? "text-[#7CFF6B]" : "text-white"
}`}
>
{value}
</div>
</div>
);
}

function MetricRail({
label,
value,
accent,
}: {
label: string;
value: number;
accent?: boolean;
}) {
return (
<div className="rounded-2xl border border-white/10 bg-black/38 px-4 py-3 backdrop-blur-md">
<div className="flex items-center justify-between text-[10px] uppercase tracking-[0.28em] text-white/42">
<span>{label}</span>
<span className={accent ? "text-[#7CFF6B]" : "text-white/55"}>{value}</span>
</div>
<div className="mt-3 h-[6px] overflow-hidden rounded-full bg-white/10">
<div
className={`h-full rounded-full ${accent ? "bg-[#7CFF6B]" : "bg-white/35"}`}
style={{ width: `${clamp(value, 4, 100)}%` }}
/>
</div>
</div>
);
}

function StatCard({
label,
value,
foot,
active,
}: {
label: string;
value: string;
foot: string;
active?: boolean;
}) {
return (
<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
<div className="text-[10px] uppercase tracking-[0.3em] text-white/38">
{label}
</div>
<div className={`mt-2 text-2xl font-semibold ${active ? "text-[#7CFF6B]" : "text-white"}`}>
{value}
</div>
<div className="mt-1 text-xs text-white/40">{foot}</div>
</div>
);
}

function ReportCard({ label, value }: { label: string; value: string }) {
return (
<div className="rounded-2xl border border-white/10 bg-black/25 p-3">
<div className="text-[10px] uppercase tracking-[0.3em] text-white/38">
{label}
</div>
<div className="mt-2 text-lg font-semibold text-white">{value}</div>
</div>
);
}

function MiniRow({ label, value }: { label: string; value: string }) {
return (
<div className="flex items-center justify-between">
<span>{label}</span>
<span className="text-white">{value}</span>
</div>
);
}

function ControlButton({
children,
onClick,
variant = "secondary",
}: {
children: React.ReactNode;
onClick: () => void;
variant?: "primary" | "secondary";
}) {
return (
<button
onClick={onClick}
className={
variant === "primary"
? "rounded-xl border border-[#7CFF6B]/35 bg-[#7CFF6B]/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-[#7CFF6B]/16"
: "rounded-xl border border-white/12 bg-white/[0.03] px-4 py-2 text-sm text-white/85 transition hover:bg-white/[0.08]"
}
>
{children}
</button>
);
}