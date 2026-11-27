// スクラップ: ページの一部を、写さずに見せる参照。指すページの id・見る範囲・倍率だけを持ち、ページの中身は持たない。
// スクラップトレイは、切り抜いて、まだ置いていないスクラップを集めておく所（対象の定義 scrap のレコード。利用者が消すまで残る）。
// 置いたスクラップ（スクラップフレームのアイテムの項目）は、スクラップトレイのスクラップの値を写して持ち、スクラップトレイとはつながらない
import { z } from "zod"
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import type { Point, Rect, Size } from "../../../core/geom"
import type { ItemPage } from "../../../core/placed"
import { kit } from "../kit"
import { pageArea, paperSize } from "../place/grow"

// 倍率の上限（1 が等倍）
export const SCRAP_SCALE_MAX = 4
// 置いた大きさ（見る範囲 × 倍率）の、短い辺の下限（px。つかめて、見分けられる大きさ）
export const SCRAP_MIN_SIDE = 24

// 見る範囲 area の倍率の下限: 置いた短い辺が SCRAP_MIN_SIDE になる倍率（等倍でもそれに届かない小さな範囲は、等倍）
export const scrapScaleMin = (area: Pick<Rect, "w" | "h">): number =>
  Math.min(1, SCRAP_MIN_SIDE / Math.min(area.w, area.h))

// スクラップの倍率が、見る範囲で決まる下限以上か（スクラップを持つ形が、自分の形の確かめに足す）
export const scrapScaleFits = (s: Pick<Scrap, "area" | "scale">): boolean => s.scale >= scrapScaleMin(s.area)
export const SCRAP_SCALE_TOO_SMALL = {
  message: `The scrap's shorter side, area × scale, must be at least ${SCRAP_MIN_SIDE} pixels`,
  path: ["scale"],
}

// スクラップのデータの形: 指すページの id、見る範囲（ページの中身の位置。可変ページの中身をずらす前の位置で持つ）、倍率。
// 倍率の下限は見る範囲で決まる（scrapScaleFits。この形を広げて使う所が、広げたあとに確かめる）
export const ScrapSchema = z.strictObject({
  page: z.string().min(1),
  area: z.strictObject({
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
  }),
  scale: z.number().positive().max(SCRAP_SCALE_MAX),
})
export type Scrap = z.output<typeof ScrapSchema>

// スクラップトレイから紙 paper に置くときのスクラップ: 紙の幅・高さの半分に収まるよう倍率を下げる（上げはしない。倍率の下限より下げない）
export const scrapToPlace = (scrap: Scrap, paper: Size): Scrap => ({
  ...scrap,
  scale: Math.max(
    scrapScaleMin(scrap.area),
    Math.min(scrap.scale, paper.w / 2 / scrap.area.w, paper.h / 2 / scrap.area.h),
  ),
})

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
    "A scrap in the user's scrap tray: a view cut out of a page (page: the page's id, area: the part shown, in the page's own pixels (on an image page, the image's own pixels), scale: 1 is the same size), kept until the user places it on a page or removes it. Only the user cuts scraps out and removes them. Listed newest first.",
  record: ScrapSchema.extend({ id: z.string().min(1), cutAt: z.string() }).refine(
    scrapScaleFits,
    SCRAP_SCALE_TOO_SMALL,
  ),
  keys: {
    cutAt: { type: "text", of: s => s.cutAt },
    page: { type: "text", of: s => s.page },
  },
  aiList: { order: { key: "cutAt", dir: "desc" }, limit: 20 },
  aiBrief: s => `${s.page} ${s.area.w}x${s.area.h} at ${s.area.x},${s.area.y} x${s.scale}`,
})

// スクラップを切り抜いてスクラップトレイに入れる。指すページがあるかは確かめない（描くときに無ければ、無いと見せる）
export const SCRAP_CUT = kit.defineAction({
  id: "scrap-cut",
  title: "Cut out a scrap",
  aiDescription: "Cut a scrap out of a page into the scrap tray (only the user).",
  target: SCRAP.id,
  userOnly: true,
  args: ScrapSchema.refine(scrapScaleFits, SCRAP_SCALE_TOO_SMALL),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const next = { id: ctx.newId(), ...args, cutAt: ctx.now }
    return { next, result: { scrap: next.id } }
  },
})

// スクラップトレイのスクラップを消す（置いたスクラップは変わらない）
export const SCRAP_REMOVE = kit.defineAction({
  id: "scrap-remove",
  title: "Remove a scrap",
  aiDescription: "Remove the scrap named by on.record from the scrap tray (only the user).",
  target: SCRAP.id,
  userOnly: true,
  args: z.strictObject({}),
  run: now => (now === "none" ? null : { next: "removed" as const, result: {} }),
})

// 可変ページの中身をずらした量（px。ページのずらした印刷区画の数 × 紙の大きさ）
export function shiftOf(catalog: CoreCatalog, page: ItemPage): Point {
  const paper = paperSize(catalog, page)
  return { x: (page.shift?.x ?? 0) * paper.w, y: (page.shift?.y ?? 0) * paper.h }
}

// 範囲（ページの中身の位置）を、今のページの上の位置にする（中身をずらした分だけ動かす）
export const areaOnPage = (area: Rect, shift: Point): Rect => ({ ...area, x: area.x + shift.x, y: area.y + shift.y })

// ページの上の位置を、範囲（ページの中身の位置）にする
export const areaOfPage = (rect: Rect, shift: Point): Rect => ({ ...rect, x: rect.x - shift.x, y: rect.y - shift.y })

declare module "../../../core/catalog" {
  interface PresentationExtras {
    // スクラップを切り抜く広さを、ページの広さでなく自分で決めるプレゼンテーション（画像のページなど）の、その広さ。スクラップの範囲はこの広さの上の座標で持ち、
    // 描くのはプレゼンテーションのビューの定義の scrapView。無ければ、ページの広さ（可変ページは中身をずらす前の位置）の上で切り抜き、印刷区画のビューで描く
    scrapSpace?(catalog: CoreCatalog, page: ItemPage): Size
  }
}

// ページ page のスクラップを切り抜く広さと、範囲をその広さの上の位置にするためにずらす量（scrapSpace を持つプレゼンテーションはずらさない）
export function scrapSpaceOf(catalog: CoreCatalog, page: ItemPage): { size: Size; shift: Point } {
  const own = catalog.presentations.get(pageType(catalog, page.type).presentation)?.scrapSpace
  return own
    ? { size: own(catalog, page), shift: { x: 0, y: 0 } }
    : { size: pageArea(catalog, page).size, shift: shiftOf(catalog, page) }
}

// 切り抜いた直後の範囲: 切り抜く広さ全体
export function wholePage(catalog: CoreCatalog, page: ItemPage): Rect {
  const { size, shift } = scrapSpaceOf(catalog, page)
  return areaOfPage({ x: 0, y: 0, w: size.w, h: size.h }, shift)
}

// ページ page（id は pageId）全体を、倍率 1 で見るスクラップ（書庫から作るスクラップ）
export const wholeScrapOf = (catalog: CoreCatalog, pageId: string, page: ItemPage): Scrap => ({
  page: pageId,
  area: wholePage(catalog, page),
  scale: 1,
})

// 範囲の一番小さい大きさ（ページの px）
export const SCRAP_AREA_MIN = 16

// 範囲 r の、つかんだ所 grip（dx・dy が 0 なら枠の中で、動かす。-1・1 はその向きの辺・角で、大きさを変える）を by だけ動かした範囲（ページ size の中に収め、一番小さい大きさを保つ）
export function movedArea(r: Rect, grip: { dx: -1 | 0 | 1; dy: -1 | 0 | 1 }, by: Point, size: Size): Rect {
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
  if (grip.dx === 0 && grip.dy === 0)
    return { ...r, x: clamp(r.x + by.x, 0, size.w - r.w), y: clamp(r.y + by.y, 0, size.h - r.h) }
  let { x, y, w, h } = r
  if (grip.dx === 1) w = clamp(w + by.x, SCRAP_AREA_MIN, size.w - x)
  if (grip.dx === -1) {
    const left = clamp(x + by.x, 0, x + w - SCRAP_AREA_MIN)
    w += x - left
    x = left
  }
  if (grip.dy === 1) h = clamp(h + by.y, SCRAP_AREA_MIN, size.h - y)
  if (grip.dy === -1) {
    const top = clamp(y + by.y, 0, y + h - SCRAP_AREA_MIN)
    h += y - top
    y = top
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}
