"use client";

export default function Label({ text }: { text: string }) {
  return (
    <div className="rounded-sm border border-white/15 bg-black/60 px-2.5 py-1 text-[11px] tracking-[0.18em] text-white backdrop-blur-sm">
      {text}
    </div>
  );
}