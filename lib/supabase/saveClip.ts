import { supabase } from "./client";

export type SaveClipInput = {
  sessionId: string;
  clipId: string;
  blob: Blob;
  createdAt: number;
  durationMs: number;
};

export type SaveClipResult = {
  storagePath: string;
  publicUrl: string | null;
};

export async function saveClipToSupabase({
  sessionId,
  clipId,
  blob,
  createdAt,
  durationMs,
}: SaveClipInput): Promise<SaveClipResult> {
  const fileExt = blob.type.includes("mp4") ? "mp4" : "webm";
  const storagePath = `${sessionId}/${clipId}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("axis-clips")
    .upload(storagePath, blob, {
      cacheControl: "3600",
      upsert: false,
      contentType: blob.type || `video/${fileExt}`,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("axis-clips").getPublicUrl(storagePath);

  const { error: insertError } = await supabase.from("axis_clips").insert({
    session_id: sessionId,
    clip_id: clipId,
    created_at_ms: createdAt,
    duration_ms: durationMs,
    size_bytes: blob.size,
    storage_path: storagePath,
    mime_type: blob.type || `video/${fileExt}`,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    storagePath,
    publicUrl: publicUrl || null,
  };
}