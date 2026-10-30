import { kit } from "../kit"
// base のスキン: ダーク（青みの暗い面。暗い所では影が見えにくいので、高い面ほど明るくして段を分ける。操作の色は淡い青 1 色）

export const DARK = kit.defineSkin({
  id: "dark",
  title: "Dark",
  scheme: "dark",
  tokens: {
    stage: "#141c25",
    "stage-grid": "rgba(164, 199, 238, 0.12)",
    surface: "#1c2733",
    "surface-muted": "#17212b",
    "surface-strong": "#304154",
    "surface-raised": "#253341",
    "shadow-1": "0 1px 6px rgb(0 0 0 / 0.20)",
    "shadow-2": "0 2px 4px rgb(0 0 0 / 0.20), 0 8px 20px rgb(0 0 0 / 0.24)",
    "shadow-3": "0 4px 12px rgb(0 0 0 / 0.24), 0 20px 48px rgb(0 0 0 / 0.32)",
    border: "#3b4d60",
    "border-strong": "#758ba2",
    text: "#e3eaf1",
    "text-muted": "#afbdcb",
    "text-disabled": "#718295",
    btn: "#33465a",
    "btn-hover": "#415972",
    accent: "#a4c7ee",
    "accent-subtle": "#2c425b",
    "on-accent": "#152539",
    danger: "#ffa5ae",
    warn: "#ebc17a",
    info: "#9ec3ee",
    success: "#8ad0ac",
    font: 'system-ui, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif',
  },
})
