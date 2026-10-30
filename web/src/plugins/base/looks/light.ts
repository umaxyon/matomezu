// base のスキン: ライト（浮かぶ面は白、ステージは青みの薄いグレー、操作の色は青 1 色）

import { kit } from "../kit"
import { DARK } from "./dark"

export const LIGHT = kit.defineSkin({
  id: "light",
  title: "Light",
  scheme: "light",
  tokens: {
    stage: "#e9eef2",
    "stage-grid": "rgba(49, 95, 146, 0.12)",
    surface: "#f3f5f7",
    "surface-muted": "#f5f7f9",
    "surface-strong": "#dce5ed",
    "surface-raised": "#ffffff",
    "shadow-1": "0 1px 6px rgb(38 50 62 / 0.06)",
    "shadow-2": "0 2px 4px rgb(38 50 62 / 0.06), 0 6px 16px rgb(38 50 62 / 0.10)",
    "shadow-3": "0 4px 12px rgb(38 50 62 / 0.08), 0 20px 48px rgb(38 50 62 / 0.16)",
    border: "#d0d8e0",
    "border-strong": "#7b8997",
    text: "#26323e",
    "text-muted": "#5a6876",
    "text-disabled": "#98a3ae",
    btn: "#e7edf2",
    "btn-hover": "#d8e3ed",
    accent: "#315f92",
    "accent-subtle": "#e5eef8",
    "on-accent": "#ffffff",
    danger: "#b63846",
    warn: "#8a5a12",
    info: "#315f92",
    success: "#287052",
    font: DARK.tokens.font,
  },
})
