// フローチャートのブック: ページごとに紙を置き、紙の上に形（@matomezu/shape）・箱・線を置く。
// 流れの向き（下へ・右へ）はブックの設定の項目で持つ。分岐（ひし形）から出る線には、キャプションの候補 Yes / No を線に渡す。見た目（テーマと紙の色）と線の既定の通り方も設定の項目で変えられる
import { z } from "zod"
import { BOOK_PAPER_COLOR, BOOK_THEME, PAPER_IDS } from "../../base"
import { kit } from "./kit"

export const FLOW_DIRECTIONS = ["down", "right"] as const
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number]

// 流れの向き（ブックに持たせる。無ければ下へ）
export const FLOW_DIRECTION = kit.defineSetting({
  id: "flow-direction",
  title: "Flow direction",
  schema: z.enum(FLOW_DIRECTIONS),
  default: "down",
})

// 道具箱に出す順: 始まりと終わりの角丸、処理の箱、分岐のひし形、ほかの形、線
const ITEMS = [
  "@matomezu/shape:shape-rounded",
  "@matomezu/box:shape-box",
  "@matomezu/shape:shape-diamond",
  "@matomezu/shape:shape-parallelogram",
  "@matomezu/shape:shape-parallelogram-reversed",
  "@matomezu/shape:shape-trapezoid",
  "@matomezu/shape:shape-trapezoid-reversed",
  "@matomezu/shape:shape-hexagon",
  "@matomezu/shape:shape-circle",
  "@matomezu/line:connector-line",
] as const

export const FLOWCHART = kit.defineBookType({
  id: "flowchart",
  version: 1,
  title: "Flowchart",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  pages: {
    paper: { allowed: PAPER_IDS, default: "@matomezu/base:a4", orientation: "portrait", perPage: true },
    addFromTabs: true,
  },
  items: {
    allowed: ITEMS,
    defaults: ITEMS,
    // 分岐（ひし形）から出る線は、キャプションの候補に Yes / No を出す
    options: {
      "@matomezu/line:connector-line": {
        captions: [{ from: ["@matomezu/shape:shape-diamond"], words: [kit.message("Yes"), kit.message("No")] }],
      },
    },
  },
  actions: {}, // 使うアクションは、選んだアイテム・見せ方・ページについて来る
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "paper",
  settings: {
    book: [BOOK_THEME.id, BOOK_PAPER_COLOR.id, "@matomezu/line:line-route", kit.name("flow-direction")],
    page: ["@matomezu/line:line-route"],
  },
})
