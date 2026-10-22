// 図面のテーマ: 付箋紙とシンプル。ブックにも箱 1 つにも当てられる（箱に当てたときは、箱の欄だけが効く）
import { defineTheme } from "../../../core/def/theme"

// 明るい紙の上に、淡い黄色の付箋を貼った見た目。角は小さく、影は薄く、右上の角を折り返す
export const STICKY = defineTheme({
  id: "sticky",
  title: "Sticky notes",
  base: {
    surface: "#e9e4d8",
    paper: "#f4efe4",
    "paper-line": "rgba(70, 55, 20, 0.14)",
    "paper-shadow": "rgba(70, 55, 20, 0.2)",
    text: "#3b3524",
    hint: "rgba(59, 53, 36, 0.55)",
    line: "#b9ad8f",
    fill: "#fff3a6",
    accent: "#c2410c",
  },
  // 付箋の色違い（淡い色）
  palette: {
    primary: "#cfe2ff",
    secondary: "#e4d5ff",
    success: "#d3f0c2",
    warn: "#fff3a6",
    danger: "#ffd0da",
    muted: "#e9e3d5",
  },
  tokens: {
    "box.fill": "#fff3a6",
    "box.line": "#d9c873",
    "box.text": "#3b3524",
    "box.radius": "3px",
    "box.shadow": "drop-shadow(0 3px 5px rgba(70, 55, 20, 0.28))",
    "box.fold": "12px",
    // リストは明るいクラフト紙の台紙の上に、行を 1 枚ずつ付箋として貼る（見出しは台紙の上の文字。旧版の見た目）
    "list.frame-line": "#b9ad8f",
    "list.mount-tint": "#e7e0cf",
    "list.mount-mix": "88%",
    "list.card-radius": "2px",
    "list.card-shadow": "drop-shadow(0 2px 3px rgba(70, 55, 20, 0.25))",
    "list.card-fold": "10px",
  },
})

// 白い背景に、白い箱と黒い枠線。飾りの少ない見た目で、資料に貼る・印刷する向け
export const SIMPLE = defineTheme({
  id: "simple",
  title: "Simple",
  base: {
    surface: "#f2f2f2",
    paper: "#ffffff",
    "paper-line": "rgba(0, 0, 0, 0.2)",
    "paper-shadow": "rgba(0, 0, 0, 0.12)",
    text: "#1a1a1a",
    hint: "rgba(26, 26, 26, 0.55)",
    line: "#262626",
    fill: "#ffffff",
    accent: "#262626",
  },
  // 白い箱と黒い文字に合う、淡めの色
  palette: {
    primary: "#bfdbfe",
    secondary: "#e9d5ff",
    success: "#bbf7d0",
    warn: "#fde68a",
    danger: "#fecaca",
    muted: "#e5e7eb",
  },
  tokens: {
    "box.fill": "#ffffff",
    "box.line": "#262626",
    "box.text": "#1a1a1a",
    "box.radius": "4px",
    "box.shadow": "none",
    // リストの見出しは黒い帯に白い文字、行のカードは黒い細い線で影なし（印刷向け）
    "list.frame-line": "#262626",
    "list.mount-mix": "3%",
    "list.head-tint": "#262626",
    "list.head-mix": "100%",
    "list.head-ink": "100%",
    "list.card-radius": "2px",
    "list.card-shadow": "none",
    "list.card-line": "100%",
  },
})
