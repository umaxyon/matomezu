// ex3 のブックのタイプ「ボード」: 自分の形（星）・紙（正方形）・設定の項目（方眼）・テーマ（ミント）を持ち、ビルトインの見せ方（紙）・リスト・線を id で選ぶ。
// テーマはほかのタイプのブックにも id で選べ、スキンは見る人が設定で選ぶ
import { type ShapeAddArgs, type ShapeEditArgs, z } from "matomezu"
import { kit } from "./kit"

export const STAR_ADD_DIALOG = kit.defineDialogWith<ShapeAddArgs>()({ id: "star-add" })
export const STAR_EDIT_DIALOG = kit.defineDialogWith<ShapeEditArgs>()({ id: "star-edit" })

const STAR_SIZE = { w: 72, h: 72 }

// 星: キャプションと先の数を持つ。大きさは変えない
export const STAR = kit.defineShape({
  id: "star",
  kind: "shape",
  version: 1,
  title: "star",
  capabilities: ["connectable", "hasText"],
  toolbox: true,
  props: z.strictObject({ caption: z.string().default(""), points: z.number().int().min(3).max(12).default(5) }),
  size: STAR_SIZE,
  min: STAR_SIZE,
  sizeOf: () => STAR_SIZE,
  captionWidth: () => STAR_SIZE.w,
  dialogs: { add: STAR_ADD_DIALOG.id, edit: STAR_EDIT_DIALOG.id },
  tokens: [{ id: "star-fill", fallback: "accent" }],
})

// 正方形の紙（縦横が同じなので、向きは見た目に効かない）
export const SQUARE = kit.definePaper({ id: "square", title: "square", size: { w: 640, h: 640 } })

// 方眼を出すか（ブックに持たせる）
export const GRID = kit.defineSetting({
  id: "board-grid",
  title: "grid",
  schema: z.boolean(),
  default: false,
})

export const MINT = kit.defineTheme({
  id: "mint",
  title: "mint",
  base: {
    surface: "#eef7f3",
    paper: "#fbfffd",
    "paper-line": "rgba(0, 80, 60, 0.15)",
    "paper-shadow": "rgba(0, 60, 40, 0.18)",
    text: "#123b30",
    hint: "rgba(18, 59, 48, 0.55)",
    line: "#2f6f5e",
    fill: "#ffffff",
    accent: "#13a07a",
  },
  palette: {
    primary: "#13a07a",
    secondary: "#3b82f6",
    success: "#22c55e",
    warn: "#eab308",
    danger: "#ef4444",
    muted: "#64748b",
  },
  tokens: { "ex3:star-fill": "#ffd34d" },
})

// 夜のスキン（アプリの枠の見た目。ブックの中身には効かない）
export const NIGHT = kit.defineSkin({
  id: "night",
  title: "night",
  scheme: "dark",
  tokens: {
    bg: "#0b1020",
    grid: "rgba(255, 255, 255, 0.04)",
    text: "#dbe4ff",
    hint: "rgba(219, 228, 255, 0.55)",
    bar: "#111833",
    tools: "#1b2447",
    line: "rgba(255, 255, 255, 0.1)",
    btn: "#232d57",
    "btn-hover": "#2f3b70",
    accent: "#7aa2ff",
    current: "#1d2a55",
    divider: "#7aa2ff",
    float: "#18214a",
    "float-line": "rgba(255, 255, 255, 0.18)",
    "float-hover": "#28356b",
    "on-accent": "#0b1020",
    danger: "#ff8a8a",
    font: 'system-ui, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif',
  },
})

const BOARD_ACTIONS = [
  "@matomezu/base:page-add",
  "@matomezu/base:book-update",
  "@matomezu/paper:item-place",
  "@matomezu/paper:item-move",
  "@matomezu/paper:item-update",
  "@matomezu/paper:item-remove",
  "@matomezu/line:line-connect",
] as const

export const BOARD = kit.defineBookType({
  id: "board",
  version: 1,
  title: "board",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  pages: {
    paper: {
      allowed: ["ex3:square", "@matomezu/base:a4"],
      default: "ex3:square",
      orientation: "portrait",
      perPage: true,
    },
    addFromTabs: true,
  },
  items: {
    allowed: ["ex3:star", "@matomezu/list:shape-list", "@matomezu/line:connector-line"],
    defaults: ["ex3:star", "@matomezu/list:shape-list", "@matomezu/line:connector-line"],
  },
  actions: { allowed: BOARD_ACTIONS, defaults: BOARD_ACTIONS },
  theme: "ex3:mint",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "paper",
  settings: { book: ["@matomezu/base:book-theme", "ex3:board-grid"], page: [] },
})
