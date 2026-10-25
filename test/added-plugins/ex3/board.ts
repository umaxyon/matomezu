// ex3 のブックのタイプ「ボード」: 自分の形（星）・紙（正方形）・設定の項目（方眼）・テーマ（ミント）を持ち、ビルトインの見せ方（紙）・リスト・線を id で選ぶ。
// テーマはほかのタイプのブックにも id で選べ、スキンは見る人が設定で選ぶ
import {
  BookLookSchema,
  defineBookType,
  defineDialogWith,
  definePaper,
  defineSetting,
  defineShape,
  defineSkin,
  defineTheme,
  type ShapeAddArgs,
  type ShapeEditArgs,
  z,
} from "matomezu"

export const STAR_ADD_DIALOG = defineDialogWith<ShapeAddArgs>()({ id: "ex3/star.add" })
export const STAR_EDIT_DIALOG = defineDialogWith<ShapeEditArgs>()({ id: "ex3/star.edit" })

const STAR_SIZE = { w: 72, h: 72 }

// 星: キャプションと先の数を持つ。大きさは変えない
export const STAR = defineShape({
  id: "ex3/star",
  kind: "shape",
  version: 1,
  title: "ex3/star",
  capabilities: ["connectable", "hasText"],
  toolbox: true,
  props: z.strictObject({ caption: z.string().default(""), points: z.number().int().min(3).max(12).default(5) }),
  size: STAR_SIZE,
  min: STAR_SIZE,
  sizeOf: () => STAR_SIZE,
  captionWidth: () => STAR_SIZE.w,
  dialogs: { add: STAR_ADD_DIALOG.id, edit: STAR_EDIT_DIALOG.id },
  tokens: [{ id: "ex3/star.fill", fallback: "accent" }],
})

// 正方形の紙（縦横が同じなので、向きは見た目に効かない）
export const SQUARE = definePaper({ id: "ex3/square", title: "ex3/square", size: { w: 640, h: 640 } })

// 方眼を出すか（ブックに持たせる）
export const GRID = defineSetting({
  id: "ex3/board.grid",
  title: "ex3/grid",
  schema: z.boolean(),
  default: false,
})

export const MINT = defineTheme({
  id: "ex3/mint",
  title: "ex3/mint",
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
  tokens: { "ex3/star.fill": "#ffd34d" },
})

// 夜のスキン（アプリの枠の見た目。ブックの中身には効かない）
export const NIGHT = defineSkin({
  id: "ex3/night",
  title: "ex3/night",
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
  "page.add",
  "book.update",
  "item.place",
  "item.move",
  "item.update",
  "item.remove",
  "line.connect",
] as const

export const BOARD = defineBookType({
  id: "ex3/board",
  version: 1,
  title: "ex3/board",
  schema: z.strictObject({
    type: z.literal("ex3/board"),
    id: z.string().min(1),
    title: z.string(),
    ...BookLookSchema,
  }),
  single: false,
  create: init => ({ type: "ex3/board", ...init, pages: [] }),
  pages: {
    paper: { allowed: ["ex3/square", "a4"], default: "ex3/square", orientation: "portrait", perPage: true },
    addFromTabs: true,
  },
  items: {
    allowed: ["ex3/star", "shape.list", "connector.line"],
    defaults: ["ex3/star", "shape.list", "connector.line"],
  },
  actions: { allowed: BOARD_ACTIONS, defaults: BOARD_ACTIONS },
  theme: "ex3/mint",
  presentation: "paper",
  tokens: [],
  tools: "paper",
  settings: { book: ["ex3/board.grid"], page: [] },
})
