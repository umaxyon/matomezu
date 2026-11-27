// フローチャートのページのタイプ: ページごとに紙を置き、紙の上に形（@matomezu/shape）・箱・線を置く。
// 流れの向き（下へ・右へ）はページの設定の項目で持つ。分岐（ひし形）から出る線には、キャプションの候補 Yes / No を線に渡す。見た目（テーマと紙の色）と線の既定の通り方も設定の項目で変えられる
import { z } from "zod"
import {
  BACKGROUND_PRINT,
  DIAGRAM_THEME_TYPE,
  PAGE_PAPER_COLOR,
  PAGE_THEME,
  PAPER_IDS,
  type SettingReader,
} from "../../base"
import { kit } from "./kit"
import { FLOWCHART_TOOLS } from "./tools"

export const FLOW_DIRECTIONS = ["down", "right"] as const
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number]

// 流れの向き（ページの設定の項目。無ければ下へ）
export const FLOW_DIRECTION = kit.defineSetting({
  id: "flow-direction",
  holder: "page",
  title: "Flow direction",
  schema: z.enum(FLOW_DIRECTIONS),
  default: "down",
})

// ツールボックスに出す順: 始まりと終わりの角丸、処理の箱、分岐のひし形、ほかの形、シェイプ（形はシェイプパネルに並ぶ）、線
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
  "@matomezu/art:shape-person",
  "@matomezu/art:shape-db",
  "@matomezu/art:shape-server",
  "@matomezu/art:shape-pc",
  "@matomezu/art:shape-factory",
  "@matomezu/art:shape-document",
  "@matomezu/art:shape-trash",
  "@matomezu/art:shape-robot",
  "@matomezu/art:shape-cat",
  "@matomezu/art:shape-heart",
  "@matomezu/art:shape-bulb",
  "@matomezu/art:shape-dog",
  "@matomezu/art:shape-forest",
  "@matomezu/art:shape-house",
  "@matomezu/art:shape-family",
  "@matomezu/scrap:shape-scrap-box",
  "@matomezu/line:connector-line",
] as const
type FlowItemId = (typeof ITEMS)[number]

// 流れの役: 開始の形（整列で本筋の始まりにする）と、分岐の形（整列で枝を分け、出る線にキャプションの候補を出す）。選んだアイテムの中から決める
const START_ITEMS: readonly FlowItemId[] = ["@matomezu/shape:shape-rounded", "@matomezu/shape:shape-circle"]
const BRANCH_ITEMS: readonly FlowItemId[] = ["@matomezu/shape:shape-diamond"]
export const isStart = (item: string): boolean => (START_ITEMS as readonly string[]).includes(item)
export const isBranch = (item: string): boolean => (BRANCH_ITEMS as readonly string[]).includes(item)

// 流れが右へか（setting はそのページで効いている設定の値）
const turnedRight = (setting: SettingReader): boolean => setting(FLOW_DIRECTION) === "right"

// 背景に置く形（ページの slide。背景編集モードで置く。ケイパビリティ on-slide を持つ形: 描画シェイプとスクラップボックス）
const BACKGROUND_ITEMS = [
  "@matomezu/slide:slide-text",
  "@matomezu/slide:slide-free-line",
  "@matomezu/slide:slide-line",
  "@matomezu/slide:slide-ellipse",
  "@matomezu/slide:slide-rectangle",
  "@matomezu/scrap:shape-scrap-box",
] as const

export const FLOWCHART = kit.definePageType({
  id: "flowchart",
  version: 1,
  title: "Flowchart",
  duplicatesPages: true, // 中の id を指す項目は、線の両端（写しが付け替える）と、survivesRenewedIds: false の形（その形のあるページは複製を断る）だけ
  grouping: "none",
  // 可変ページは、流れの始まりの側を固定して残りの 3 つの向きへ増やす（下へなら上を、右へなら左を固定。base の拡張ポイント）
  grow: {
    sides: setting =>
      turnedRight(setting)
        ? { up: true, down: true, left: false, right: true }
        : { up: false, down: true, left: true, right: true },
  },
  paper: {
    allowed: PAPER_IDS,
    default: "@matomezu/base:a4",
    orientation: "portrait",
  },
  slide: { allowed: BACKGROUND_ITEMS, background: true },
  items: {
    allowed: ITEMS,
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
  actions: { add: [kit.name("page-align")] }, // ほかに使うアクションは、選んだアイテム・プレゼンテーション・ページについて来る
  theme: "@matomezu/base:standard",
  themeTypes: [DIAGRAM_THEME_TYPE], // 使えるテーマのテーマタイプ
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: FLOWCHART_TOOLS.id,
  // キャプションで形が広がるときは、流れが下へなら横の真ん中を保ち（本筋の縦の線がずれない）、右へなら左を保つ
  growFrom: setting => (turnedRight(setting) ? { x: "start", y: "center" } : { x: "center", y: "start" }),
  settings: [
    PAGE_THEME.id,
    PAGE_PAPER_COLOR.id,
    "@matomezu/line:line-route",
    kit.name("flow-direction"),
    BACKGROUND_PRINT.id,
  ],
})
