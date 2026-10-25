// hoge とは別の作り手のブックのタイプの見本: 自分の形（星）と設定の項目（方眼）とテーマ（ミント）を持ち、中の見せ方（紙）・リスト・線を id で選ぶ
import {
  BookLookSchema,
  defineBookType,
  defineDialogWith,
  defineSetting,
  defineShape,
  defineTheme,
  type Point,
} from "matomezu"
import { z } from "zod"

export const STAR_ADD_DIALOG = defineDialogWith<{ page: string; at: Point }>()({ id: "fuga/star.add" })
export const STAR_EDIT_DIALOG = defineDialogWith<{ page: string; item: string }>()({ id: "fuga/star.edit" })

const STAR_SIZE = { w: 72, h: 72 }

// 星: キャプションと先の数を持つ
export const STAR = defineShape({
  id: "fuga/star",
  kind: "shape",
  version: 1,
  title: "fuga star",
  capabilities: ["connectable", "hasText"],
  toolbox: true,
  props: z.strictObject({ caption: z.string().default(""), points: z.number().int().min(3).max(12).default(5) }),
  size: STAR_SIZE,
  min: STAR_SIZE,
  sizeOf: () => STAR_SIZE,
  captionWidth: () => STAR_SIZE.w,
  dialogs: { add: STAR_ADD_DIALOG.id, edit: STAR_EDIT_DIALOG.id },
  tokens: [{ id: "fuga/star.fill", fallback: "accent" }],
})

// 方眼を出すか（ブックに持たせる）
export const BOARD_GRID = defineSetting({
  id: "fuga/board.grid",
  title: "fuga grid",
  field: "fugaGrid",
  schema: z.boolean(),
  default: false,
})

export const MINT = defineTheme({
  id: "fuga/mint",
  title: "fuga mint",
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
  tokens: { "fuga/star.fill": "#ffd34d" },
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
  id: "fuga/board",
  version: 1,
  title: "fuga board",
  schema: z.strictObject({
    type: z.literal("fuga/board"),
    id: z.string().min(1),
    title: z.string(),
    ...BookLookSchema,
  }),
  single: false,
  create: init => ({ type: "fuga/board", ...init, pages: [] }),
  pages: {
    paper: { allowed: ["a4", "a3"], default: "a3", orientation: "landscape", perPage: true },
    addFromTabs: true,
  },
  items: {
    allowed: ["fuga/star", "shape.list", "connector.line"],
    defaults: ["fuga/star", "shape.list", "connector.line"],
  },
  actions: { allowed: BOARD_ACTIONS, defaults: BOARD_ACTIONS },
  theme: "fuga/mint",
  presentation: "paper",
  tokens: [],
  tools: "paper",
  settings: { book: ["fuga/board.grid"], page: [] },
})
