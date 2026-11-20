// 可変ページの広さ: 紙の大きさで区切った印刷区画を、中身が入るだけ並べる（place/items の pageArea が使う）。区切りの線の位置も出す
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import type { GrowChoice } from "../../../core/def/paper"
import type { Rect, Size } from "../../../core/geom"
import type { Page } from "../../../core/schema/book"
import type { SettingReader } from "../book-settings"
import { setField } from "../utils/fields"

// 可変ページの増やす向き: 上・下・左・右のうち、どれへ印刷区画を増やすか
export interface GrowSides {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

// 利用者が選んだ増やす向き（ページの grows）の上・下・左・右
export const GROW_CHOICE_SIDES = {
  "right-down": { up: false, down: true, left: false, right: true },
  right: { up: false, down: false, left: false, right: true },
  down: { up: false, down: true, left: false, right: false },
  all: { up: true, down: true, left: true, right: true },
} as const satisfies Record<GrowChoice, GrowSides>

// 可変ページの増やす向きの決め方: 利用者が choices から選ぶ（最初のものが既定。ページの grows に選んだものを持つ）か、
// タイプがページで効いている設定の値 setting から決める（ページの grows は true）か、どのページもいつも可変ページで、いつも always へ増やす
// （ページの grows には持たず、可変ページにする・やめるは選べない）
export type GrowRule =
  | { choices: readonly GrowChoice[] }
  | { sides(setting: SettingReader): GrowSides }
  | { always: GrowSides }

// 決め方 rule の種類: 利用者が選べる増やす向きの一覧（最初のものが既定）、タイプが向きを決める by-type、どのページもいつも可変ページの always、
// 可変ページを作れない none（rule が無い）
export const growKindOf = (rule: GrowRule | undefined): readonly GrowChoice[] | "by-type" | "always" | "none" =>
  !rule ? "none" : "always" in rule ? "always" : "choices" in rule ? rule.choices : "by-type"

// 可変ページの増やす向きの決め方（定義オブジェクトの拡張ポイントに書き足す。無ければ可変ページを作れない。ページを持つタイプだけが使う）
declare module "../../../core/catalog" {
  interface PageTypeExtras {
    grow?: GrowRule
  }
}

// 紙の大きさ paper で区切った印刷区画を、中身の外枠 extent（紙の座標。無ければ中身が無い）が入るだけ、増やす向き sides に並べた数と、その広さ。
// 増やさない向きは 1 つ。spare なら、右・下へ増やす向きに空きの印刷区画を 1 つずつ足す（書く画面で、そこへ置けば増える）
export function grownArea(
  paper: Size,
  sides: GrowSides,
  extent: Rect | null,
  spare = false,
): { columns: number; rows: number; size: Size } {
  // 端がちょうど印刷区画の境目なら、次の印刷区画は要らない（割り算の誤差で 1 つ増やさない）。左（上）へ増やすページは、
  // 左（上）の空きの印刷区画をデータに持つ（items.ts の alignPadding）ので、少なくとも 2 つ
  const count = (end: number, len: number, before: boolean, after: boolean) =>
    before || after ? Math.max(before ? 2 : 1, Math.ceil(end / len - 1e-9)) + (spare && after ? 1 : 0) : 1
  const columns = count(extent ? extent.x + extent.w : 0, paper.w, sides.left, sides.right)
  const rows = count(extent ? extent.y + extent.h : 0, paper.h, sides.up, sides.down)
  return { columns, rows, size: { w: columns * paper.w, h: rows * paper.h } }
}

// 広さ area を紙の大きさ paper で区切った印刷区画の数と、境目の線の位置（縦の線の x と、横の線の y）。紙 1 枚に収まる広さなら null
export function printAreaLines(
  paper: Size,
  area: Size,
): { columns: number; rows: number; xs: number[]; ys: number[] } | null {
  if (area.w <= paper.w && area.h <= paper.h) return null
  const columns = Math.round(area.w / paper.w)
  const rows = Math.round(area.h / paper.h)
  return {
    columns,
    rows,
    xs: Array.from({ length: columns - 1 }, (_, i) => (i + 1) * paper.w),
    ys: Array.from({ length: rows - 1 }, (_, i) => (i + 1) * paper.h),
  }
}

// タイプ type のページを、可変ページにする・やめるを選べるか（いつも可変ページのタイプは選べない）
export function canGrow(catalog: CoreCatalog, type: string): boolean {
  const kind = growKindOf(pageType(catalog, type).grow)
  return kind !== "none" && kind !== "always"
}

// タイプ type で利用者が選べる増やす向き（最初のものが既定）。タイプが決めるなら空
export function growChoices(catalog: CoreCatalog, type: string): readonly GrowChoice[] {
  const kind = growKindOf(pageType(catalog, type).grow)
  return typeof kind === "string" ? [] : kind
}

// 可変ページにするか（true・false）か、選んだ増やす向き grows を、タイプ type のページの grows の値にしたもの。作れない・選べない向きなら null。
// 向きを選べるタイプで true なら既定の向き。false なら undefined（可変ページでない）
export function growsValue(catalog: CoreCatalog, type: string, grows: boolean | GrowChoice): Page["grows"] | null {
  if (grows === false) return undefined
  if (!canGrow(catalog, type)) return null
  const choices = growChoices(catalog, type)
  if (grows === true) return choices[0] ?? true
  return choices.includes(grows) ? grows : null
}

// ページ page の grows を grows（ページの grows の値）にしたもの（中身は、ノーマライズステップ pages/variable-pages.ts が増やす向きに合わせてずらす）
export const withGrows = <P extends Page>(page: P, grows: Page["grows"]): P =>
  setField(page, ["orientation"], "grows", grows)
