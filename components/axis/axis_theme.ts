// components/axis/axis-theme.ts

export const AXIS_THEME = {
bg: "#050505",
panel: "#0b0b0b",
panelSoft: "#101010",
border: "#1c1c1c",
borderStrong: "#2a2a2a",

textPrimary: "#f5f5f5",
textSecondary: "#a1a1aa",
textMuted: "#6b7280",
textDark: "#050505",

font: {
mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
sans: "Inter, ui-sans-serif, system-ui, sans-serif",
},

signal: {
low: "#707070",
mid: "#7dd3fc",
high: "#4ade80",
},

integrity: {
low: "#525252",
mid: "#facc15",
high: "#4ade80",
},

status: {
aligned: "#4ade80",
ready: "#7dd3fc",
wait: "#a1a1aa",
building: "#facc15",
unstable: "#fb7185",
off: "#6b7280",
},

phase: {
locking: "#7dd3fc",
set: "#facc15",
release: "#4ade80",
land: "#c084fc",
idle: "#6b7280",
},

rep: {
clean: "#4ade80",
delayed: "#facc15",
rushed: "#fb7185",
off: "#a1a1aa",
straight: "#7dd3fc",
},

button: {
bg: "#111111",
border: "#2a2a2a",
text: "#f5f5f5",
activeBg: "#f5f5f5",
activeText: "#050505",
},
} as const;

export type AxisTheme = typeof AXIS_THEME;