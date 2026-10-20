// 標準のテーマ: 白い紙に濃い文字
import { defineTheme } from "../../core/def/theme"

export const STANDARD = defineTheme({
  id: "standard",
  title: "標準",
  base: {
    surface: "#f6f6f8",
    paper: "#ffffff",
    "paper-line": "rgba(0, 0, 0, 0.12)",
    "paper-shadow": "rgba(0, 0, 0, 0.18)",
    text: "#1b1b1f",
    hint: "rgba(40, 40, 50, 0.55)",
    line: "#3a3a40",
    fill: "#ffffff",
    accent: "#6d4bd8",
  },
})
