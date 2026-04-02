"use client";

import { useEffect, useRef, useState } from "react";
import type { CameraStatus } from "@/types/axis";

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function useAxisCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lockIntervalRef = useRef<number | null>(null);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("IDLE");
  const [cameraError, setCameraError] = useState("");
  const [subjectLocked, setSubjectLocked] = useState(false);
  const [lockStrength, setLockStrength] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    return () => {
      if (lockIntervalRef.current) {
        window.clearInterval(lockIntervalRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (cameraStatus !== "READY") return;

    lockIntervalRef.current = window.setInterval(() => {
      const nextStrength = randomInt(35, 96);
      setLockStrength(nextStrength);
      setSubjectLocked(nextStrength >= 58);
    }, 350);

    return () => {
      if (lockIntervalRef.current) {
        window.clearInterval(lockIntervalRef.current);
      }
    };
  }, [cameraStatus]);

  async function attachAndPlay(stream: MediaStream) {
    const video = videoRef.current;
    if (!video) {
      throw new Error("Video element not ready.");
    }

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    await new Promise<void>((resolve) => {
      if (video.readyState >= 1) {
        resolve();
        return;
      }

      const handleLoadedMetadata = () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        resolve();
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
    });

    await video.play();
    setHasVideo(true);
  }

  async function startCamera() {
    try {
      setCameraStatus("REQUESTING");
      setCameraError("");
      setHasVideo(false);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      await attachAndPlay(stream);

      setCameraStatus("READY");
    } catch (error) {
      setCameraStatus("ERROR");
      setCameraError(
        error instanceof Error ? error.message : "Camera unavailable."
      );
      setHasVideo(false);
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

    setCameraStatus("IDLE");
    setCameraError("");
    setSubjectLocked(false);
    setLockStrength(0);
    setHasVideo(false);
  }

  return {
    videoRef,
    cameraStatus,
    cameraError,
    subjectLocked,
    lockStrength,
    hasVideo,
    startCamera,
    stopCamera,
  };
}