import { kit } from "../kit"
// 標準のテーマの組の付箋紙とシンプル。ブックにも箱 1 つにも当てられる（箱に当てたときは、箱のテーマキーだけが効く）。
// アイテムのテーマキー（箱・リスト・線など）も上書きする（インスタンスに無いアイテムのテーマキーは使われない）

// 明るい紙の上に、淡い黄色の付箋を貼った見た目。角は小さく、影は薄く、右上の角を折り返す
export const STICKY = kit.defineTheme({
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
    "@matomezu/box:box-fill": "#fff3a6",
    "@matomezu/box:box-line": "#d9c873",
    "@matomezu/box:box-text": "#3b3524",
    "@matomezu/box:box-radius": "3px",
    "@matomezu/box:box-shadow": "drop-shadow(0 3px 5px rgba(70, 55, 20, 0.28))",
    "@matomezu/box:box-fold": "12px",
    // リストは明るいクラフト紙の台紙の上に、行を 1 枚ずつ付箋として貼る（見出しは帯にせず台紙の上の文字）
    "@matomezu/list:list-fill": "#fff3a6",
    "@matomezu/list:list-line": "#d9c873",
    "@matomezu/list:list-text": "#3b3524",
    "@matomezu/list:list-radius": "3px",
    "@matomezu/list:list-shadow": "drop-shadow(0 3px 5px rgba(70, 55, 20, 0.28))",
    "@matomezu/list:list-frame-line": "#b9ad8f",
    "@matomezu/list:list-mount-tint": "#e7e0cf",
    "@matomezu/list:list-mount-mix": "88%",
    "@matomezu/list:list-card-radius": "2px",
    "@matomezu/list:list-card-shadow": "drop-shadow(0 2px 3px rgba(70, 55, 20, 0.25))",
    "@matomezu/list:list-card-fold": "10px",
    // データは付箋の地に、茶色の線と淡い目盛り
    "@matomezu/data:data-fill": "#fff3a6",
    "@matomezu/data:data-line": "#d9c873",
    "@matomezu/data:data-text": "#3b3524",
    "@matomezu/data:data-radius": "3px",
    "@matomezu/data:data-shadow": "drop-shadow(0 3px 5px rgba(70, 55, 20, 0.28))",
    "@matomezu/data:data-head-fill": "#f7e98a",
    "@matomezu/data:data-grid": "#eadc93",
    "@matomezu/data:data-zero": "#8a7a4a",
  },
})

// 白い背景に、白い箱と黒い枠線。飾りの少ない見た目で、資料に貼る・印刷する向け
export const SIMPLE = kit.defineTheme({
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
    "@matomezu/box:box-fill": "#ffffff",
    "@matomezu/box:box-line": "#262626",
    "@matomezu/box:box-text": "#1a1a1a",
    "@matomezu/box:box-radius": "4px",
    "@matomezu/box:box-shadow": "none",
    // リストの見出しは黒い帯に白い文字、行のカードは黒い細い線で影なし（印刷向け）
    "@matomezu/list:list-fill": "#ffffff",
    "@matomezu/list:list-line": "#262626",
    "@matomezu/list:list-text": "#1a1a1a",
    "@matomezu/list:list-radius": "4px",
    "@matomezu/list:list-shadow": "none",
    "@matomezu/list:list-frame-line": "#262626",
    "@matomezu/list:list-mount-mix": "3%",
    "@matomezu/list:list-head-tint": "#262626",
    "@matomezu/list:list-head-mix": "100%",
    "@matomezu/list:list-head-ink": "100%",
    "@matomezu/list:list-card-radius": "2px",
    "@matomezu/list:list-card-shadow": "none",
    "@matomezu/list:list-card-line": "100%",
    // データは黒い線と濃い軸、薄い灰色の目盛り（印刷向け）
    "@matomezu/data:data-fill": "#ffffff",
    "@matomezu/data:data-line": "#262626",
    "@matomezu/data:data-text": "#1a1a1a",
    "@matomezu/data:data-radius": "4px",
    "@matomezu/data:data-head-fill": "#f2f2f2",
    "@matomezu/data:data-axis": "#1a1a1a",
    "@matomezu/data:data-grid": "#d9d9d9",
    "@matomezu/data:data-zero": "#262626",
  },
})
