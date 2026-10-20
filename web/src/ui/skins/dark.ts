import { defineSkin } from "./def"

export const DARK = defineSkin({
  id: "dark",
  title: "ダーク",
  scheme: "dark",
  tokens: {
    bg: "#1e1e1e",
    grid: "rgba(255, 255, 255, 0.035)",
    text: "#e4e4e7",
    hint: "rgba(220, 220, 230, 0.55)",
    bar: "#252526",
    tools: "#34343a",
    line: "rgba(255, 255, 255, 0.08)",
    btn: "#3a3a3f",
    "btn-hover": "#4a4a50",
    accent: "#8b6cf0",
    font: 'system-ui, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif',
  },
})
