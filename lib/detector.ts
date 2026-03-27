"use client";

type DetectorInstance = {
estimatePoses: (video: HTMLVideoElement) => Promise<any[]>;
dispose?: () => void;
};

declare global {
interface Window {
detector?: DetectorInstance;
}
}

let detectorPromise: Promise<DetectorInstance> | null = null;

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
const tf = await import("@tensorflow/tfjs");
await import("@tensorflow/tfjs-backend-webgl");
const poseDetection = await import("@tensorflow-models/pose-detection");

await tf.setBackend("webgl");
await tf.ready();

const detector = await poseDetection.createDetector(
poseDetection.SupportedModels.MoveNet,
{
modelType: (poseDetection as any).movenet?.modelType?.SINGLEPOSE_LIGHTNING ?? "SinglePose.Lightning",
} as any,
);

const wrapped: DetectorInstance = {
estimatePoses: async (video: HTMLVideoElement) => {
if (!video) return [];
return detector.estimatePoses(video);
},
dispose: () => {
try {
detector.dispose?.();
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