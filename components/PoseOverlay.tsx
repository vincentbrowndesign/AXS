"use client";

type Point = {
x: number;
y: number;
};

type PoseOverlayProps = {
points: Point[];
width?: number;
height?: number;
};

const CONNECTIONS: [number, number][] = [
[5, 7],
[7, 9],
[6, 8],
[8, 10],
[5, 6],
[5, 11],
[6, 12],
[11, 12],
[11, 13],
[13, 15],
[12, 14],
[14, 16],
];

export default function PoseOverlay({
points,
width = 1280,
height = 720,
}: PoseOverlayProps) {
if (!points || points.length === 0) return null;

return (
<svg
viewBox={`0 0 ${width} ${height}`}
preserveAspectRatio="none"
style={{
position: "absolute",
top: 0,
left: 0,
width: "100%",
height: "100%",
pointerEvents: "none",
zIndex: 2,
}}
>
{CONNECTIONS.map(([a, b]) => {
const p1 = points[a];
const p2 = points[b];
if (!p1 || !p2) return null;

return (
<line
key={`${a}-${b}`}
x1={p1.x}
y1={p1.y}
x2={p2.x}
y2={p2.y}
stroke="#7dd3fc"
strokeWidth={3}
strokeLinecap="round"
/>
);
})}

{points.map((p, i) => {
if (!p) return null;

return <circle key={i} cx={p.x} cy={p.y} r={5} fill="#4ade80" />;
})}
</svg>
);
}