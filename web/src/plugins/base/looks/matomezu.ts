import { DIAGRAM_THEME_TYPE } from "../book-look/theme-types"
import { kit } from "../kit"
import { TEXT_ERROR, TEXT_INFO, TEXT_SUCCESS, TEXT_WARN } from "../text/colors"
import { DARK } from "./dark"

// base の matomezu のテーマと、ライト・ダークのスキン: マスコットの鳥 5 羽の色。明るいほうの広い面はクリーム色と白、色は小さな面と印に配る。
// インコのプラムは操作と選択、文鳥のチャコールは文字、スズメのテラコッタとアンバーは分類、ツナギドリの緑はつなぐ・成功、ホンフクロウの紺は案内

// 鳥の色（主色）と、その淡色・差し色
const PLUM = "#7c2d60" // 07C インコ
const PLUM_TINT = "#f4eaf1"
const CHARCOAL = "#45474b" // 07D 文鳥
const TERRA_TINT = "#fff1e5"
const AMBER = "#f5a623"
const AMBER_TEXT = "#b86e00" // 文字にするアンバー（白い紙で読める暗さ）
const FOREST = "#356650" // 07 ツナギドリ
const INDIGO = "#303d73" // 08 ホンフクロウ
const RED = "#b42332" // 消す・失敗（鳥の色とは別）
const CREAM = "#f6f3ed"
const CREAM_LINE = "#e3dbd2"

export const MATOMEZU_THEME = kit.defineTheme({
  id: "matomezu",
  title: "matomezu",
  themeTypes: [DIAGRAM_THEME_TYPE],
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
  textColors: {
    [TEXT_SUCCESS.id]: FOREST,
    [TEXT_INFO.id]: INDIGO,
    [TEXT_WARN.id]: AMBER_TEXT,
    [TEXT_ERROR.id]: RED,
  },
})

// 明るい所のスキン: クリーム色の地に白の浮かぶ面、強調はインコのプラム
export const MATOMEZU_LIGHT_SKIN = kit.defineSkin({
  id: "matomezu-light",
  title: "matomezu Light",
  scheme: "light",
  tokens: {
    recess: "#e2d9cd",
    stage: "#ede6db",
    "stage-grid": "rgba(110, 90, 70, 0.1)",
    surface: CREAM,
    "surface-muted": "#fbf9f6",
    "surface-strong": TERRA_TINT,
    "surface-raised": "#ffffff",
    bubble: "#fdf3dc",
    "shadow-1": "0 0 8px rgb(90 60 30 / 0.1)",
    "shadow-2": "0 1px 2px rgb(90 60 30 / 0.08), 0 3px 10px rgb(90 60 30 / 0.12)",
    "shadow-3": "0 2px 6px rgb(90 60 30 / 0.08), 0 10px 30px rgb(90 60 30 / 0.18)",
    border: CREAM_LINE,
    "border-strong": "#9a8773",
    text: CHARCOAL,
    "text-muted": "#6a5d54",
    "text-disabled": "rgba(106, 93, 84, 0.45)",
    btn: "#f1ebe2",
    "btn-hover": "#e7ddd0",
    accent: PLUM,
    "accent-subtle": PLUM_TINT,
    "on-accent": "#ffffff",
    danger: RED,
    warn: "#92601a",
    info: INDIGO,
    success: FOREST,
    font: DARK.tokens.font,
  },
})

// 暗い所のスキン: 面は紫みの暗い色で、高い面ほど明るい。強調はインコの色を明るくした藤色、印は鳥の差し色寄りの明るい色
export const MATOMEZU_DARK_SKIN = kit.defineSkin({
  id: "matomezu-dark",
  title: "matomezu Dark",
  scheme: "dark",
  tokens: {
    recess: "#141218",
    stage: "#1c1a20",
    "stage-grid": "rgba(182, 166, 242, 0.10)",
    surface: "#211d25",
    "surface-muted": "#27232c",
    "surface-strong": "#44332f",
    "surface-raised": "#322c36",
    bubble: "#3d3638",
    "shadow-1": "0 1px 6px rgb(0 0 0 / 0.22)",
    "shadow-2": "0 2px 4px rgb(0 0 0 / 0.22), 0 8px 20px rgb(0 0 0 / 0.28)",
    "shadow-3": "0 4px 12px rgb(0 0 0 / 0.28), 0 20px 48px rgb(0 0 0 / 0.36)",
    border: "#514651",
    "border-strong": "#9c8798",
    text: "#f2e9e1",
    "text-muted": "#c8b9c2",
    "text-disabled": "#857682",
    btn: "#453a48",
    "btn-hover": "#57465a",
    accent: "#b6a6f2",
    "accent-subtle": "#38304f",
    "on-accent": "#251f3a",
    danger: "#ff9ea8",
    warn: "#e9b777",
    info: "#83c9cf",
    success: "#a9c596",
    font: DARK.tokens.font,
  },
})
