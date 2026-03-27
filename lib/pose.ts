import * as poseDetection from "@tensorflow-models/pose-detection";

type Point = {
x: number;
y: number;
score?: number;
};

let detector: poseDetection.PoseDetector | null = null;

export async function initPose() {
if (detector) return detector;

detector = await poseDetection.createDetector(
poseDetection.SupportedModels.MoveNet,
{
modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
enableSmoothing: true,
}
);

return detector;
}

export async function detectPose(
video: HTMLVideoElement
): Promise<Point[]> {
if (!detector) return [];

const poses = await detector.estimatePoses(video);

if (!poses.length) return [];

return (poses[0].keypoints || []).map((kp) => ({
x: kp.x ?? 0,
y: kp.y ?? 0,
score: kp.score ?? 0,
}));
}