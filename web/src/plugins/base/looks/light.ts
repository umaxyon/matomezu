// base のスキン: ライト

import { kit } from "../kit"
import { DARK } from "./dark"

export const LIGHT = kit.defineSkin({
  id: "light",
  title: "Light",
  scheme: "light",
  tokens: {
    stage: "#e6e8ee",
    "stage-grid": "rgba(0, 0, 0, 0.06)",
    surface: "#f1eff8",
    "surface-muted": "#f4f4f7",
    "surface-strong": "#e4e0f2",
    "surface-raised": "#ffffff",
    "shadow-1": "0 0 8px rgb(0 0 0 / 0.08)",
    "shadow-2": "0 1px 2px rgb(0 0 0 / 0.08), 0 3px 10px rgb(0 0 0 / 0.12)",
    "shadow-3": "0 2px 6px rgb(0 0 0 / 0.08), 0 10px 30px rgb(0 0 0 / 0.18)",
    border: "rgba(0, 0, 0, 0.1)",
    "border-strong": "rgba(0, 0, 0, 0.22)",
    text: "#1b1b1f",
    "text-muted": "rgba(40, 40, 50, 0.55)",
    "text-disabled": "rgba(40, 40, 50, 0.3)",
    btn: "#ececf0",
    "btn-hover": "#dedee4",
    accent: "#6d4bd8",
    "accent-subtle": "#eae6f9",
    "on-accent": "#ffffff",
    danger: "#dc2626",
    warn: "#d97706",
    info: "#4f6bd8",
    success: "#2f9e6a",
    font: DARK.tokens.font,
  },
})
