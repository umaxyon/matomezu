// プロジェクト: タスクボード 1 枚の区切り。名前・チケットの番号の頭（プレフィクス）・閉じているか・レーンの並び・チケットタグを持つ。
// レーンの並びには未分類の行もちょうど 1 つ入る（並べ替えた位置が残り、shown が「未分類を表示する」）。
// チケットはレーン・タグを id で指す（消したときにチケットは書き換えず、読む側が「無い物は未分類・タグなし」とする）。
// 閉じたプロジェクトには、チケットを足せない（認可ステップ closed-project）
import { z } from "zod"
import { PALETTE } from "../../plugin-api"
import { kit } from "./kit"

export const PROJECT_NAME_MAX = 30
export const LANE_NAME_MAX = 10
export const TAG_NAME_MAX = 10

// チケットの番号の頭: 英字で始まり、英字とハイフンだけ（ハイフンまで含めて持つ。例 T-）
const PREFIX = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[A-Za-z][A-Za-z-]*$/)

export const UNSORTED = "unsorted" // 未分類の行・チケットのレーンの値
export const NO_TAG = "none" // タグなしのチケットのタグの値

const LANE = z.strictObject({
  kind: z.literal("lane"),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(LANE_NAME_MAX),
  prompt: z.string(), // AI がそのレーンでチケットをどう扱うかの指示
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
    new Set(rows.map(l => l.name)).size === rows.length
  )
}
const tagsOk = (tags: readonly z.output<typeof TAG>[]) =>
  new Set(tags.map(t => t.id)).size === tags.length && new Set(tags.map(t => t.name)).size === tags.length

export const LANES = z.array(z.union([LANE, UNSORTED_ROW])).refine(lanesOk)
export const TAGS = z.array(TAG).refine(tagsOk)
export { LANE, PREFIX, TAG, UNSORTED_ROW }

export const PROJECT = kit.defineSubject({
  id: "project",
  title: "project",
  aiDescription:
    "A project: one task board. It has a name, the prefix of its ticket numbers (such as T-), closed (no ticket can be added to a closed project), the lanes in order (each with a prompt that tells you how to handle the tickets in the lane; unsorted is a row of the lanes too) and the ticket tags (each with a prompt that tells you how to handle the tickets with the tag).",
  record: z.strictObject({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(PROJECT_NAME_MAX),
    prefix: PREFIX,
    closed: z.boolean(),
    lanes: LANES,
    tags: TAGS,
  }),
  aiBrief: p => `${p.prefix} ${p.name}`,
  aiListed: p => !p.closed,
})
