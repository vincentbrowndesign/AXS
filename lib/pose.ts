"use client";

import { initDetector } from "@/lib/detector";

export type Point = {
x: number;
y: number;
score?: number;
name?: string;
};

export type PoseFrame = {
keypoints: Point[];
};

export async function estimatePose(
video: HTMLVideoElement,
): Promise<PoseFrame | null> {
if (!video || video.readyState < 2) return null;

const detector = await initDetector();
const poses = await detector.estimatePoses(video);
const pose = poses?.[0];

if (!pose) return null;

return {
keypoints: pose.keypoints.map((k) => ({
x: k.x,
y: k.y,
score: k.score,
name: k.name,
})),
};
}

export async function estimatePoses(
video: HTMLVideoElement,
): Promise<PoseFrame[]> {
const pose = await estimatePose(video);
return pose ? [pose] : [];
}