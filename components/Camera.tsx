"use client";

import { useEffect, useRef } from "react";

type Props = {
isActive?: boolean;
onReady?: (video: HTMLVideoElement) => void;
};

export default function Camera({ isActive = true, onReady }: Props) {
const videoRef = useRef<HTMLVideoElement | null>(null);

useEffect(() => {
if (!isActive) return;

let stream: MediaStream | null = null;
let cancelled = false;

async function startCamera() {
try {
stream = await navigator.mediaDevices.getUserMedia({
video: {
width: { ideal: 1280 },
height: { ideal: 720 },
facingMode: "user",
},
audio: false,
});

if (cancelled) {
stream.getTracks().forEach((track) => track.stop());
return;
}

const video = videoRef.current;
if (!video) return;

video.srcObject = stream;
video.muted = true;
video.playsInline = true;
video.autoplay = true;

video.onloadedmetadata = async () => {
try {
await video.play();
} catch (error) {
console.error("Video play failed:", error);
}

if (onReady) {
onReady(video);
}
};
} catch (err) {
console.error("Camera error:", err);
}
}

startCamera();

return () => {
cancelled = true;

if (stream) {
stream.getTracks().forEach((track) => track.stop());
}
};
}, [isActive, onReady]);

return (
<video
ref={videoRef}
playsInline
muted
autoPlay
style={{
position: "absolute",
top: 0,
left: 0,
width: "100%",
height: "100%",
objectFit: "cover",
zIndex: 1,
background: "#000",
}}
/>
);
}