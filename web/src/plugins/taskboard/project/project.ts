// プロジェクト: タスクボード 1 枚の区切り。名前・チケットプレフィクス（チケットの番号の頭）・閉じているか・レーンの並び・チケットタグを持つ。
// レーンの並びには未分類の行もちょうど 1 つ入る（並べ替えた位置が残り、shown が「未分類を表示する」）。
// チケットはレーン・タグを id で指す（消したときにチケットは書き換えず、読む側が「無いレーンは未分類、無いタグは外す」とする）。
// 閉じたプロジェクトには、チケットを足せず、プロジェクトも開け直すほかは直せない（認可ステップ closed-project）
import { z } from "zod"
import { PALETTE } from "../../../plugin-api"
import { kit } from "../kit"

export const PROJECT_NAME_MAX = 30
export const LANE_NAME_MAX = 10
export const TAG_NAME_MAX = 10

// チケットプレフィクス: 英字 1〜3 字と、最後にハイフン 1 つまで（ハイフンまで含めて持つ。例 T-）
export const PREFIX_PATTERN = /^[A-Za-z]{1,3}-?$/
const PREFIX = z.string().trim().regex(PREFIX_PATTERN)

// 名前 a と b が同じか（前後の空白を除いて比べる。caseless なら大文字小文字を分けない）
export const sameName = (a: string, b: string, caseless = false) =>
  caseless ? a.trim().toLowerCase() === b.trim().toLowerCase() : a.trim() === b.trim()

// チケットプレフィクスを比べる形（大文字と小文字を分けない）
export const prefixKey = (prefix: string) => prefix.trim().toLowerCase()

// 名前の並び names のうち、ほかと重なっている物の位置（空の名前は数えない）
export function repeatedAt(names: readonly string[]): ReadonlySet<number> {
  const at = new Set<number>()
  names.forEach((n, i) => {
    if (n.trim() !== "" && names.some((m, k) => k !== i && sameName(m, n))) at.add(i)
  })
  return at
}

export const UNSORTED = "unsorted" // 未分類の行・チケットのレーンの値
// チケットカードの大きさ（チケットサイズ）: large は題を折り返し、medium は題を 1 行で切り、small は番号と題の 1 行だけ。
// レーンは inherit でプロジェクトの大きさに従う。完了のレーンにしたレーンは、画面で small にする（DONE_LANE_CARD_SIZE）
export const CARD_SIZES = ["large", "medium", "small"] as const
export type CardSize = (typeof CARD_SIZES)[number]
export const INHERIT_CARD_SIZE = "inherit"
export const DONE_LANE_CARD_SIZE: CardSize = "small"
// レーン lane が、プロジェクト project の完了のレーンか（完了のレーンが無ければ、どのレーンも違う）
export const inDoneLane = (project: { doneLane?: string | undefined }, lane: string): boolean =>
  project.doneLane !== undefined && project.doneLane === lane
// レーン lane が、プロジェクト project の作業中の印のあるレーンか
export const inWorkingLane = (
  project: { lanes: readonly { kind: string; id?: string; working?: true }[] },
  lane: string,
): boolean => project.lanes.some(l => l.kind === "lane" && l.id === lane && l.working === true)

// チケットカードに出す物の、出す・出さない（priority は右下の優先度の印）。プロジェクトごと
export const CARD_SHOWS = z.strictObject({ priority: z.boolean(), volume: z.boolean() })
export type CardShows = z.output<typeof CARD_SHOWS>
export const CARD_SHOWS_DEFAULT: CardShows = { priority: true, volume: true }

export const NO_DONE_LANE = "none" // 完了のレーンを無しにするときの、project-update の doneLane の値（プロジェクトのレコードでは doneLane を持たない）

const LANE = z.strictObject({
  kind: z.literal("lane"),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(LANE_NAME_MAX),
  prompt: z.string(), // AI がそのレーンでチケットをどう扱うかの指示
  cardSize: z.enum([INHERIT_CARD_SIZE, ...CARD_SIZES]), // このレーンのチケットカードの大きさ（inherit はプロジェクトの大きさ）
  working: z.literal(true).optional(), // 作業中の印（このレーンにあるチケットは、担当のワークルームそれぞれの今のチケット。いくつのレーンにも付けられ、完了のレーンには付けない）
})
const UNSORTED_ROW = z.strictObject({ kind: z.literal("unsorted"), shown: z.boolean() })
const TAG = z.strictObject({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(TAG_NAME_MAX),
  color: z.enum(PALETTE), // 色の役割（なしは無い）
  enabled: z.boolean(), // 外すと、新しくは付けられない（もう付いている物はそのまま）
  prompt: z.string(), // AI がそのタグのチケットをどう扱うかの指示
})

// レーンの並びの形: 未分類がちょうど 1 つ、レーンの id と名前は重ならない
const lanesOk = (lanes: readonly z.output<typeof LANE | typeof UNSORTED_ROW>[]) => {
  const rows = lanes.filter((l): l is z.output<typeof LANE> => l.kind === "lane")
  return (
    lanes.filter(l => l.kind === "unsorted").length === 1 &&
    new Set(rows.map(l => l.id)).size === rows.length &&
    repeatedAt(rows.map(l => l.name)).size === 0
  )
}
const tagsOk = (tags: readonly z.output<typeof TAG>[]) =>
  new Set(tags.map(t => t.id)).size === tags.length && repeatedAt(tags.map(t => t.name)).size === 0

export const LANES = z.array(z.union([LANE, UNSORTED_ROW])).refine(lanesOk)
export const TAGS = z.array(TAG).refine(tagsOk)
export { LANE, PREFIX, TAG, UNSORTED_ROW }

export const PROJECT = kit.defineSubject({
  id: "project",
  title: "project",
  aiDescription:
    "A project: one task board. It has a name, the prefix of its ticket numbers (such as T-), closed (no ticket can be added to a closed project, and the project cannot be changed but reopened), the lanes in order (each with a prompt that tells you how to handle the tickets in the lane, and working: true on the lanes the user marked as working lanes, any number of them; a ticket in a working lane is the current ticket of the workroom that leads it, its first assignee; unsorted is a row of the lanes too), doneLane (the id of the lane where completed tickets are; absent when there is none; never a working lane; a ticket gets there only through ticket-complete: the prompt of the done lane tells when a ticket is done, and then you complete it with ticket-complete), the ticket tags (each with a prompt that tells you how to handle the tickets with the tag) and cardSize (large, medium or small: how big the ticket cards are drawn on the board; each lane has a cardSize too, where inherit takes the project's) and cardShows (what the ticket cards show besides the number and the name: priority, whether the card shows the ticket's priority, and volume, whether it shows the ticket's volume).",
  record: z
    .strictObject({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(PROJECT_NAME_MAX),
      prefix: PREFIX,
      closed: z.boolean(),
      lanes: LANES,
      tags: TAGS,
      doneLane: z.string().min(1).optional(), // 完了のレーンの id（無ければ完了のレーンは無い。レーンを消したら外す）
      cardSize: z.enum(CARD_SIZES), // チケットカードの大きさ（レーンが inherit のとき）
      cardShows: CARD_SHOWS, // チケットカードに出す物
    })
    .refine(p => p.doneLane === undefined || !inWorkingLane(p, p.doneLane)), // 完了のレーンに作業中の印は付けない
  // prefix は、重なりを確かめるのに比べる形（前後の空白を除き、小文字にした物）
  keys: { prefix: { type: "text", of: p => prefixKey(p.prefix) } },
  aiBrief: p => `${p.prefix} ${p.name}`,
  aiListed: { when: p => !p.closed, unlisted: "closed projects" },
})
