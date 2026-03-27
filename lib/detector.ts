import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";

declare global {
interface Window {
detector?: poseDetection.PoseDetector;
}
}

let detectorPromise: Promise<poseDetection.PoseDetector> | null = null;

export async function initDetector() {
if (typeof window === "undefined") {
throw new Error("initDetector must run in the browser.");
}

if (window.detector) {
return window.detector;
}

if (!detectorPromise) {
detectorPromise = createMoveNetDetector();
}

const detector = await detectorPromise;
window.detector = detector;
return detector;
}

export async function getDetector() {
if (typeof window === "undefined") {
throw new Error("getDetector must run in the browser.");
}

if (window.detector) {
return window.detector;
}

return initDetector();
}

export async function disposeDetector() {
if (typeof window === "undefined") return;

if (window.detector) {
window.detector.dispose();
window.detector = undefined;
}

detectorPromise = null;
}

async function createMoveNetDetector() {
await ensureTfReady();

const model = poseDetection.SupportedModels.MoveNet;

const detectorConfig: poseDetection.MoveNetModelConfig = {
modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
enableSmoothing: true,
};

const detector = await poseDetection.createDetector(model, detectorConfig);
return detector;
}

async function ensureTfReady() {
await tf.ready();

const current = tf.getBackend();

if (current !== "webgl") {
const ok = await tf.setBackend("webgl");
if (!ok) {
throw new Error("Failed to set TensorFlow.js backend to webgl.");
}
await tf.ready();
}

return tf.getBackend();
}