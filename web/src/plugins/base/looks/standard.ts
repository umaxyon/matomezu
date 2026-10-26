import { kit } from "../kit"
// 標準のテーマ: 白い紙に濃い文字

export const STANDARD = kit.defineTheme({
  id: "standard",
  title: "Standard",
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
  palette: {
    primary: "#3b82f6",
    secondary: "#a855f7",
    success: "#22c55e",
    warn: "#eab308",
    danger: "#ef4444",
    muted: "#64748b",
  },
})
