"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveClipToSupabase } from "@/lib/supabase/saveClip";

type SavedClip = {
  id: string;
  createdAt: number;
  url: string;
  size: number;
  durationMs: number;
  uploadStatus: "pending" | "uploading" | "uploaded" | "error";
  storagePath?: string;
};

type PendingCapture = {
  id: string;
  createdAt: number;
  preChunks: Blob[];
};

const PRE_ROLL_MS = 3000;
const POST_ROLL_MS = 1000;
const TIMESLICE_MS = 250;
const MAX_CLIPS = 60;

function pickMimeType(): string {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return "";

  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }

  return "";
}

function makeSessionId() {
  return `session_${Date.now()}`;
}

export default function Page() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const rollingChunksRef = useRef<Array<{ blob: Blob; ts: number }>>([]);
  const pendingCapturesRef = useRef<PendingCapture[]>([]);
  const postTimersRef = useRef<Map<string, number>>(new Map());
  const flashTimerRef = useRef<number | null>(null);
  const lastTriggerAtRef = useRef(0);
  const sessionIdRef = useRef<string>(makeSessionId());

  const [cameraReady, setCameraReady] = useState(false);
  const [recordingReady, setRecordingReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const [status, setStatus] = useState<"IDLE" | "STARTING" | "LIVE" | "MARKED" | "STOPPED" | "ERROR">("IDLE");
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mimeType = useMemo(() => pickMimeType(), []);

  const revokeClipUrls = useCallback((items: SavedClip[]) => {
    items.forEach((clip) => URL.revokeObjectURL(clip.url));
  }, []);

  const clearAllTimers = useCallback(() => {
    for (const timerId of postTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    postTimersRef.current.clear();

    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
  }, []);

  const cleanupRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
  }, []);

  const cleanupStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
  }, []);

  const pulseFlash = useCallback(() => {
    setFlash(true);

    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current);
    }

    flashTimerRef.current = window.setTimeout(() => {
      setFlash(false);
      flashTimerRef.current = null;
    }, 120);
  }, []);

  const playTapSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      audio.currentTime = 0;
      void audio.play();
    } catch {
      // ignore
    }
  }, []);

  const uploadClip = useCallback(async (clipId: string, blob: Blob, createdAt: number, durationMs: number) => {
    setClips((prev) =>
      prev.map((clip) =>
        clip.id === clipId ? { ...clip, uploadStatus: "uploading" } : clip
      )
    );

    try {
      const result = await saveClipToSupabase({
        sessionId: sessionIdRef.current,
        clipId,
        blob,
        createdAt,
        durationMs,
      });

      setClips((prev) =>
        prev.map((clip) =>
          clip.id === clipId
            ? {
                ...clip,
                uploadStatus: "uploaded",
                storagePath: result.storagePath,
              }
            : clip
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";

      setClips((prev) =>
        prev.map((clip) =>
          clip.id === clipId ? { ...clip, uploadStatus: "error" } : clip
        )
      );

      setError(message);
    }
  }, []);

  const finalizeCapture = useCallback(
    (captureId: string) => {
      const pending = pendingCapturesRef.current.find((item) => item.id === captureId);
      if (!pending) return;

      const postCutoff = pending.createdAt + POST_ROLL_MS + TIMESLICE_MS + 150;

      const postChunks = rollingChunksRef.current
        .filter((item) => item.ts > pending.createdAt && item.ts <= postCutoff)
        .map((item) => item.blob);

      const allChunks = [...pending.preChunks, ...postChunks];
      pendingCapturesRef.current = pendingCapturesRef.current.filter((item) => item.id !== captureId);

      const timerId = postTimersRef.current.get(captureId);
      if (timerId) {
        window.clearTimeout(timerId);
        postTimersRef.current.delete(captureId);
      }

      if (allChunks.length === 0) return;

      const blob = new Blob(allChunks, {
        type: mimeType || "video/webm",
      });

      const url = URL.createObjectURL(blob);

      const savedClip: SavedClip = {
        id: captureId,
        createdAt: pending.createdAt,
        url,
        size: blob.size,
        durationMs: PRE_ROLL_MS + POST_ROLL_MS,
        uploadStatus: "pending",
      };

      setClips((prev) => {
        const next = [savedClip, ...prev];
        const trimmed = next.slice(0, MAX_CLIPS);
        const dropped = next.slice(MAX_CLIPS);

        if (dropped.length) revokeClipUrls(dropped);

        return trimmed;
      });

      void uploadClip(captureId, blob, pending.createdAt, PRE_ROLL_MS + POST_ROLL_MS);
    },
    [mimeType, revokeClipUrls, uploadClip]
  );

  const startSystem = useCallback(async () => {
    setError(null);
    setIsStarting(true);
    setStatus("STARTING");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API unavailable.");
      }

      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder unsupported.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(() => {});
      }

      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          setError("Camera stream ended.");
          setStatus("ERROR");
          setIsRunning(false);
          setRecordingReady(false);
          setCameraReady(false);
        };
      });

      setCameraReady(true);

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : undefined
      );

      recorder.ondataavailable = (event: BlobEvent) => {
        if (!event.data || event.data.size === 0) return;

        const now = Date.now();

        rollingChunksRef.current.push({
          blob: event.data,
          ts: now,
        });

        const cutoff = now - PRE_ROLL_MS - 500;
        rollingChunksRef.current = rollingChunksRef.current.filter((item) => item.ts >= cutoff);
      };

      recorder.onerror = () => {
        setError("Recorder error.");
        setStatus("ERROR");
      };

      recorder.start(TIMESLICE_MS);
      recorderRef.current = recorder;

      setRecordingReady(true);
      setIsRunning(true);
      setStatus("LIVE");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to start system.";
      cleanupRecorder();
      cleanupStream();
      setError(message);
      setStatus("ERROR");
    } finally {
      setIsStarting(false);
    }
  }, [cleanupRecorder, cleanupStream, mimeType]);

  const tapEvent = useCallback(() => {
    if (!isRunning || !recordingReady) return;

    const createdAt = Date.now();
    const id = `clip_${createdAt}`;

    const preChunks = rollingChunksRef.current
      .filter((item) => item.ts >= createdAt - PRE_ROLL_MS && item.ts <= createdAt)
      .map((item) => item.blob);

    pendingCapturesRef.current.push({
      id,
      createdAt,
      preChunks,
    });

    const timerId = window.setTimeout(() => {
      finalizeCapture(id);
    }, POST_ROLL_MS + TIMESLICE_MS + 100);

    postTimersRef.current.set(id, timerId);

    setTapCount((prev) => prev + 1);
    setStatus("MARKED");
    pulseFlash();
    playTapSound();

    window.setTimeout(() => {
      setStatus((current) => (current === "MARKED" ? "LIVE" : current));
    }, 180);
  }, [finalizeCapture, isRunning, playTapSound, pulseFlash, recordingReady]);

  const triggerTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTriggerAtRef.current < 180) return;
    lastTriggerAtRef.current = now;
    tapEvent();
  }, [tapEvent]);

  const stopSystem = useCallback(() => {
    setIsRunning(false);
    setRecordingReady(false);
    setCameraReady(false);
    setFlash(false);
    setStatus("STOPPED");
    clearAllTimers();
    cleanupRecorder();
    cleanupStream();
  }, [cleanupRecorder, cleanupStream, clearAllTimers]);

  const resetSession = useCallback(() => {
    clearAllTimers();
    cleanupRecorder();
    cleanupStream();

    rollingChunksRef.current = [];
    pendingCapturesRef.current = [];
    lastTriggerAtRef.current = 0;
    sessionIdRef.current = makeSessionId();

    setTapCount(0);
    setFlash(false);
    setStatus("IDLE");
    setError(null);
    setIsRunning(false);
    setRecordingReady(false);
    setCameraReady(false);

    setClips((prev) => {
      revokeClipUrls(prev);
      return [];
    });
  }, [clearAllTimers, cleanupRecorder, cleanupStream, revokeClipUrls]);

  const clearClips = useCallback(() => {
    setClips((prev) => {
      revokeClipUrls(prev);
      return [];
    });
  }, [revokeClipUrls]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();

      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;

      if (e.code === "Space") {
        e.preventDefault();
        triggerTap();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [triggerTap]);

  useEffect(() => {
    return () => {
      clearAllTimers();
      cleanupRecorder();
      cleanupStream();
      revokeClipUrls(clips);
    };
  }, [clearAllTimers, cleanupRecorder, cleanupStream, revokeClipUrls, clips]);

  return (
    <main className="min-h-screen bg-black text-white">
      <audio ref={audioRef} src="/tap.mp3" preload="auto" />

      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-3 p-3 md:p-4">
        <header className="flex items-center justify-between border border-white/15 px-3 py-2">
          <div className="text-sm font-medium tracking-[0.2em]">AXIS LIVE</div>
          <div className="flex items-center gap-2 text-xs tracking-[0.2em] text-white/70">
            <span className="border border-white/15 px-2 py-1">{status}</span>
            <span className="border border-white/15 px-2 py-1">{tapCount} TAPS</span>
          </div>
        </header>

        <section className="border border-white/15">
          <div
            onClick={triggerTap}
            role="button"
            tabIndex={0}
            aria-label="Tap live view to capture event"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                triggerTap();
              }
            }}
            className="relative aspect-video w-full overflow-hidden bg-neutral-950 outline-none"
            style={{ touchAction: "manipulation" }}
          >
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              autoPlay
              muted
              playsInline
            />

            {flash && <div className="pointer-events-none absolute inset-0 bg-white/35" />}

            <div className="pointer-events-none absolute left-2 top-2 flex gap-2 text-[10px] tracking-[0.18em] md:text-xs">
              <span className="border border-white/20 bg-black/65 px-2 py-1">
                {cameraReady ? "CAM READY" : "CAM OFF"}
              </span>
              <span className="border border-white/20 bg-black/65 px-2 py-1">
                {recordingReady ? "BUFFER LIVE" : "BUFFER OFF"}
              </span>
            </div>

            <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] tracking-[0.18em] text-white/80 md:text-xs">
              <span className="border border-white/20 bg-black/65 px-2 py-1">
                PRE {PRE_ROLL_MS / 1000}s
              </span>
              <span className="border border-white/20 bg-black/65 px-2 py-1">
                POST {POST_ROLL_MS / 1000}s
              </span>
              <span className="border border-white/20 bg-black/65 px-2 py-1">
                SPACE / TAP
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-px border-t border-white/15 bg-white/15">
            <button
              onClick={startSystem}
              disabled={isStarting || isRunning}
              className="bg-black px-3 py-4 text-sm tracking-[0.18em] transition hover:bg-white/5 disabled:opacity-40"
            >
              {isStarting ? "STARTING" : "START"}
            </button>

            <button
              onClick={triggerTap}
              disabled={!isRunning}
              className="bg-black px-3 py-4 text-sm tracking-[0.18em] transition hover:bg-white/5 disabled:opacity-40"
            >
              TAP
            </button>

            <button
              onClick={isRunning || cameraReady ? stopSystem : resetSession}
              className="bg-black px-3 py-4 text-sm tracking-[0.18em] transition hover:bg-white/5"
            >
              {isRunning || cameraReady ? "STOP" : "RESET"}
            </button>
          </div>
        </section>

        {error ? (
          <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {!isRunning && clips.length > 0 && (
          <section className="border border-white/15">
            <div className="flex items-center justify-between border-b border-white/15 px-3 py-2">
              <div className="text-sm tracking-[0.18em]">SESSION CLIPS</div>
              <button
                onClick={clearClips}
                className="border border-white/15 px-2 py-1 text-xs tracking-[0.18em] text-white/70 hover:bg-white/5"
              >
                CLEAR
              </button>
            </div>

            <div className="grid gap-px bg-white/10 md:grid-cols-2 xl:grid-cols-3">
              {clips.map((clip, index) => (
                <div key={clip.id} className="bg-black p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="text-xs tracking-[0.18em] text-white/50">
                        CLIP {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="text-xs text-white/70">
                        {new Date(clip.createdAt).toLocaleTimeString()}
                      </div>
                    </div>

                    <div className="text-[10px] tracking-[0.18em] text-white/60">
                      {clip.uploadStatus === "pending" && "PENDING"}
                      {clip.uploadStatus === "uploading" && "UPLOADING"}
                      {clip.uploadStatus === "uploaded" && "UPLOADED"}
                      {clip.uploadStatus === "error" && "ERROR"}
                    </div>
                  </div>

                  <video
                    src={clip.url}
                    controls
                    playsInline
                    className="aspect-video w-full bg-neutral-950"
                  />

                  <div className="mt-2 flex items-center justify-between text-[10px] text-white/50">
                    <span>{(clip.size / 1024 / 1024).toFixed(2)} MB</span>
                    <span>{(clip.durationMs / 1000).toFixed(1)}s</span>
                  </div>

                  {clip.storagePath ? (
                    <div className="mt-2 break-all text-[10px] text-white/35">
                      {clip.storagePath}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}