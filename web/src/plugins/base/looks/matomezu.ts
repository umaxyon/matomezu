import { kit } from "../kit"
import { DARK } from "./dark"

// base の matomezu のテーマとスキン: マスコットの鳥 5 羽の色。広い面はクリーム色と白、色は小さな面と印に配る。
// インコのプラムは操作と選択、文鳥のチャコールは文字、スズメのテラコッタとアンバーは分類、ツナギドリの緑はつなぐ・成功、ホンフクロウの紺は案内

// 鳥の色（主色）と、その淡色・差し色
const PLUM = "#7c2d60" // 07C インコ
const PLUM_TINT = "#f4eaf1"
const CHARCOAL = "#45474b" // 07D 文鳥
const TERRA = "#a84b28" // 07A スズメ
const TERRA_TINT = "#fff1e5"
const AMBER = "#f5a623"
const FOREST = "#356650" // 07 ツナギドリ
const INDIGO = "#303d73" // 08 ホンフクロウ
const RED = "#b42332" // 消す・失敗（鳥の色とは別）
const CREAM = "#f6f3ed"
const CREAM_LINE = "#e3dbd2"

export const MATOMEZU_THEME = kit.defineTheme({
  id: "matomezu",
  title: "matomezu",
  base: {
    surface: CREAM,
    paper: "#ffffff",
    "paper-line": "rgba(110, 90, 70, 0.14)",
    "paper-shadow": "rgba(90, 60, 30, 0.16)",
    text: CHARCOAL,
    hint: "rgba(69, 71, 75, 0.55)",
    line: CHARCOAL,
    fill: "#ffffff",
    accent: PLUM,
  },
  palette: {
    primary: PLUM,
    secondary: INDIGO,
    success: FOREST,
    warn: AMBER,
    danger: RED,
    muted: CHARCOAL,
  },
  tokens: {
    "@matomezu/box:box-line": CREAM_LINE,
    "@matomezu/box:box-shadow": "drop-shadow(0 1px 3px rgba(90, 60, 30, 0.14))",
    "@matomezu/list:list-line": CREAM_LINE,
    "@matomezu/list:list-frame-line": CREAM_LINE,
    "@matomezu/list:list-shadow": "drop-shadow(0 1px 3px rgba(90, 60, 30, 0.14))",
    "@matomezu/list:list-card-shadow": "drop-shadow(0 1px 3px rgba(90, 60, 30, 0.14))",
    // 台紙はスズメの淡色に寄せる
    "@matomezu/list:list-mount-tint": TERRA,
    "@matomezu/list:list-mount-mix": "6%",
    "@matomezu/tree:tree-node-line": CREAM_LINE,
    "@matomezu/dir:dir-folder": AMBER,
    "@matomezu/dir:dir-file": "#8a8178",
    // 線は文鳥の色を紙に混ぜた落ち着いた色（強調したい線は、線の色で緑などにする）
    "@matomezu/line:line-color": `color-mix(in srgb, ${CHARCOAL} 55%, var(--theme-paper))`,
  },
})

export const MATOMEZU_SKIN = kit.defineSkin({
  id: "matomezu",
  title: "matomezu",
  scheme: "light",
  tokens: {
    stage: CREAM,
    "stage-grid": "rgba(110, 90, 70, 0.1)",
    surface: "#ede6db",
    "surface-muted": "#fbf9f6",
    "surface-strong": TERRA_TINT,
    "surface-raised": "#ffffff",
    "shadow-1": "0 0 8px rgb(90 60 30 / 0.1)",
    "shadow-2": "0 1px 2px rgb(90 60 30 / 0.08), 0 3px 10px rgb(90 60 30 / 0.12)",
    "shadow-3": "0 2px 6px rgb(90 60 30 / 0.08), 0 10px 30px rgb(90 60 30 / 0.18)",
    border: CREAM_LINE,
    "border-strong": "#c9bcae",
    text: CHARCOAL,
    "text-muted": "#6a5d54",
    "text-disabled": "rgba(106, 93, 84, 0.45)",
    btn: "#f1ebe2",
    "btn-hover": "#e7ddd0",
    accent: PLUM,
    "accent-subtle": PLUM_TINT,
    "on-accent": "#ffffff",
    danger: RED,
    warn: AMBER,
    info: INDIGO,
    success: FOREST,
    font: DARK.tokens.font,
  },
})
