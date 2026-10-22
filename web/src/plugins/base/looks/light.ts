// base のスキン: ライト

import { defineSkin } from "../../../core/def/skin"
import { DARK } from "./dark"

export const LIGHT = defineSkin({
  id: "light",
  title: "Light",
  scheme: "light",
  tokens: {
    bg: "#f6f6f8",
    grid: "rgba(0, 0, 0, 0.045)",
    text: "#1b1b1f",
    hint: "rgba(40, 40, 50, 0.55)",
    bar: "#ffffff",
    tools: "#e6e6ec",
    line: "rgba(0, 0, 0, 0.1)",
    btn: "#ececf0",
    "btn-hover": "#dedee4",
    accent: "#6d4bd8",
    current: "#eae6f9",
    divider: "#6d4bd8",
    float: "#ffffff",
    "float-line": "rgba(0, 0, 0, 0.12)",
    "float-hover": "#ece8fb",
    "on-accent": "#ffffff",
    font: DARK.tokens.font,
  },
})
