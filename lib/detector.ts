"use client";

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

type KeypointLike = {
name?: string;
score?: number;
x: number;
y: number;
};

type PoseLike = {
keypoints: KeypointLike[];
};

type DetectorInstance = {
estimatePoses: (video: HTMLVideoElement) => Promise<PoseLike[]>;
dispose?: () => void;
};

declare global {
interface Window {
detector?: DetectorInstance;
}
}

let detectorPromise: Promise<DetectorInstance> | null = null;

const LANDMARK_NAMES = [
"nose",
"left_eye_inner",
"left_eye",
"left_eye_outer",
"right_eye_inner",
"right_eye",
"right_eye_outer",
"left_ear",
"right_ear",
"mouth_left",
"mouth_right",
"left_shoulder",
"right_shoulder",
"left_elbow",
"right_elbow",
"left_wrist",
"right_wrist",
"left_pinky",
"right_pinky",
"left_index",
"right_index",
"left_thumb",
"right_thumb",
"left_hip",
"right_hip",
"left_knee",
"right_knee",
"left_ankle",
"right_ankle",
"left_heel",
"right_heel",
"left_foot_index",
"right_foot_index",
];

function normalizePoseResult(
landmarks: Array<{ x: number; y: number; visibility?: number }>,
video: HTMLVideoElement,
): PoseLike {
const width = video.videoWidth || 1280;
const height = video.videoHeight || 720;

const keypoints: KeypointLike[] = landmarks.map((lm, index) => ({
name: LANDMARK_NAMES[index],
score: typeof lm.visibility === "number" ? lm.visibility : 1,
x: lm.x * width,
y: lm.y * height,
}));

return { keypoints };
}

export async function initDetector(): Promise<DetectorInstance> {
if (typeof window === "undefined") {
throw new Error("Detector can only initialize in the browser.");
}

if (window.detector) {
return window.detector;
}

if (detectorPromise) {
return detectorPromise;
}

detectorPromise = (async () => {
const vision = await FilesetResolver.forVisionTasks(
"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
);

const landmarker = await PoseLandmarker.createFromOptions(vision, {
baseOptions: {
modelAssetPath:
"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
},
runningMode: "VIDEO",
numPoses: 1,
});

const wrapped: DetectorInstance = {
estimatePoses: async (video: HTMLVideoElement) => {
if (!video || video.readyState < 2) return [];

const result = landmarker.detectForVideo(video, performance.now());
const landmarks = result.landmarks?.[0];

if (!landmarks) return [];
return [normalizePoseResult(landmarks, video)];
},
dispose: () => {
try {
landmarker.close();
} catch (error) {
console.error("Detector dispose failed:", error);
}
},
};

window.detector = wrapped;
return wrapped;
})();

try {
return await detectorPromise;
} catch (error) {
detectorPromise = null;
throw error;
}
}