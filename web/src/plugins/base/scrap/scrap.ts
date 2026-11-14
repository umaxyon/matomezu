// スクラップ: ページの一部をくり抜いて見せる参照。指すページの id・見る範囲・倍率だけを持ち、ページの中身は持たない。
// スクラップトレイは、切り抜いて、まだ置いていないスクラップを集めておく所（対象の定義 scrap のレコード。利用者が消すまで残る）。
// 置いたスクラップ（スクラップを置く枠のアイテムの項目）は、トレイのスクラップの値を写して持ち、トレイとはつながらない
import { z } from "zod"
import type { Size } from "../../../core/geom"
import { kit } from "../kit"

// 倍率の範囲（1 が等倍）
export const SCRAP_SCALE_MIN = 0.1
export const SCRAP_SCALE_MAX = 4

// スクラップのデータの形: 指すページの id、見る範囲（ページの中身の位置。可変ページの中身をずらす前の位置で持つ）、倍率
export const ScrapSchema = z.strictObject({
  page: z.string().min(1),
  area: z.strictObject({
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
  }),
  scale: z.number().min(SCRAP_SCALE_MIN).max(SCRAP_SCALE_MAX),
})
export type Scrap = z.output<typeof ScrapSchema>

// スクラップを置いたときの大きさ（見る範囲 × 倍率。小数は切り上げる）
export const scrapSize = (scrap: Pick<Scrap, "area" | "scale">): Size => ({
  w: Math.ceil(scrap.area.w * scrap.scale),
  h: Math.ceil(scrap.area.h * scrap.scale),
})

// スクラップトレイのスクラップ 1 つ（切り抜いた時点 cutAt の新しい順に並べる）
export const SCRAP = kit.defineSubject({
  id: "scrap",
  title: "Scrap",
  aiDescription:
    "A scrap in the user's scrap tray: a view cut out of a page (page: the page's id, area: the part shown, in the page's own pixels, scale: 1 is the same size), kept until the user places it on a page or removes it. Only the user cuts scraps out and removes them. Listed newest first.",
  record: ScrapSchema.extend({ id: z.string().min(1), cutAt: z.string() }),
  keys: {
    cutAt: { type: "text", of: s => s.cutAt },
    page: { type: "text", of: s => s.page },
  },
  aiList: { order: { key: "cutAt", dir: "desc" }, limit: 20 },
  aiBrief: s => `${s.page} ${s.area.w}x${s.area.h} at ${s.area.x},${s.area.y} x${s.scale}`,
})

// スクラップを切り抜いてトレイに入れる。指すページがあるかは確かめない（描くときに無ければ、無いと見せる）
export const SCRAP_CUT = kit.defineAction({
  id: "scrap-cut",
  title: "Cut out a scrap",
  aiDescription: "Cut a scrap out of a page into the scrap tray (only the user).",
  target: SCRAP.id,
  userOnly: true,
  args: ScrapSchema,
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const next = { id: ctx.newId(), ...args, cutAt: ctx.now }
    return { next, result: { scrap: next.id } }
  },
})

// トレイのスクラップを消す（置いたスクラップは変わらない）
export const SCRAP_REMOVE = kit.defineAction({
  id: "scrap-remove",
  title: "Remove a scrap",
  aiDescription: "Remove the scrap named by on.record from the scrap tray (only the user).",
  target: SCRAP.id,
  userOnly: true,
  args: z.strictObject({}),
  run: now => (now === "none" ? null : { next: "removed" as const, result: {} }),
})
