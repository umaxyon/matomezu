import { kit } from "../kit"
// base のスキン: ダーク（暗い所では影が見えにくいので、高い面ほど明るくして段を分ける）

export const DARK = kit.defineSkin({
  id: "dark",
  title: "Dark",
  scheme: "dark",
  tokens: {
    stage: "#121214",
    "stage-grid": "rgba(255, 255, 255, 0.04)",
    surface: "#1d1b23",
    "surface-muted": "#18171c",
    "surface-strong": "#34323d",
    "surface-raised": "#2a2930",
    "shadow-1": "0 0 10px rgb(0 0 0 / 0.45)",
    "shadow-2": "0 1px 2px rgb(0 0 0 / 0.4), 0 4px 12px rgb(0 0 0 / 0.5)",
    "shadow-3": "0 2px 6px rgb(0 0 0 / 0.4), 0 12px 36px rgb(0 0 0 / 0.6)",
    border: "rgba(255, 255, 255, 0.09)",
    "border-strong": "rgba(255, 255, 255, 0.2)",
    text: "#e4e4e7",
    "text-muted": "rgba(220, 220, 230, 0.55)",
    "text-disabled": "rgba(220, 220, 230, 0.3)",
    btn: "#3a3a3f",
    "btn-hover": "#4a4a50",
    accent: "#8b6cf0",
    "accent-subtle": "#332f42",
    "on-accent": "#ffffff",
    danger: "#f87171",
    warn: "#fbbf24",
    font: 'system-ui, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif',
  },
})
