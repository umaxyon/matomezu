// フローチャートのブック: ページごとに紙を置き、紙の上に形（@matomezu/shape）・箱・線を置く。
// 流れの向き（下へ・右へ）はブックとページの設定の項目で持つ（ページはブックを継承できる）。分岐（ひし形）から出る線には、キャプションの候補 Yes / No を線に渡す。見た目（テーマと紙の色）と線の既定の通り方も設定の項目で変えられる
import { z } from "zod"
import { BOOK_PAPER_COLOR, BOOK_THEME, PAPER_IDS } from "../../base"
import { kit } from "./kit"

export const FLOW_DIRECTIONS = ["down", "right"] as const
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number]

// 流れの向き（ブックとページに持たせる。ページはブックを継承できる。無ければ下へ）
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
type FlowItemId = (typeof ITEMS)[number]

// 流れの役: 開始の形（整列で本筋の始まりにする）と、分岐の形（整列で枝を分け、出る線にキャプションの候補を出す）。選んだアイテムの中から決める
const START_ITEMS: readonly FlowItemId[] = ["@matomezu/shape:shape-rounded", "@matomezu/shape:shape-circle"]
const BRANCH_ITEMS: readonly FlowItemId[] = ["@matomezu/shape:shape-diamond"]
export const isStart = (item: string): boolean => (START_ITEMS as readonly string[]).includes(item)
export const isBranch = (item: string): boolean => (BRANCH_ITEMS as readonly string[]).includes(item)

// 流れが右へか（setting はそのページで効いている設定の値）
const turnedRight = (setting: (id: string) => unknown): boolean => setting(FLOW_DIRECTION.id) === "right"

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
      // 流れが右へのブックでは、台形を反時計回りに 90 度回して描く（上が狭い台形は左が狭く、下が狭い台形は右が狭くなる）
      "@matomezu/shape:shape-trapezoid": { turned: turnedRight },
      "@matomezu/shape:shape-trapezoid-reversed": { turned: turnedRight },
      "@matomezu/line:connector-line": {
        captions: [{ from: BRANCH_ITEMS, words: [kit.message("Yes"), kit.message("No")] }],
      },
    },
  },
  actions: { add: [kit.name("page-align")] }, // ほかに使うアクションは、選んだアイテム・見せ方・ページについて来る
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "paper",
  // キャプションで形が広がるときは、流れが下へなら横の真ん中を保ち（本筋の縦の線がずれない）、右へなら左を保つ
  growFrom: setting => (turnedRight(setting) ? { x: "start", y: "center" } : { x: "center", y: "start" }),
  settings: {
    book: [BOOK_THEME.id, BOOK_PAPER_COLOR.id, "@matomezu/line:line-route", kit.name("flow-direction")],
    page: ["@matomezu/line:line-route", kit.name("flow-direction")],
  },
})
