// 行のドラッグで画面の要素から読む物: つかんだ行の写しの見た目（大きさ・倍率・つかんだ所・行の所の CSS 変数）と、ポインタの下のリストで行を落とす所と光る線の位置
import { dropPlace } from "./rows"

// ポインタに付く行の写し: 行の大きさ（紙の上の px）と画面での倍率、つかんだ所（行の左上から、画面の px）、行の所の CSS 変数
export interface GhostLook {
  w: number
  h: number
  scale: number
  grab: { x: number; y: number }
  vars: Record<string, string>
}

// 行の要素 li から写しの見た目を取る。変数はテーマキー（names）と、台紙・文字・行の地。scale はステージの倍率（写しも同じ倍率で描く）
export function ghostLook(li: HTMLElement, x: number, y: number, names: readonly string[], scale: number): GhostLook {
  const r = li.getBoundingClientRect()
  const css = getComputedStyle(li)
  const vars: Record<string, string> = {}
  for (const name of [...names, "--mount", "--ink", "--row-fill"]) {
    const v = css.getPropertyValue(name)
    if (v !== "") vars[name] = v
  }
  return { w: li.offsetWidth, h: li.offsetHeight, scale, grab: { x: x - r.left, y: y - r.top }, vars }
}

// 行を落とす所: リスト list の行 before の前（無ければ最後）と、光らせる所（画面の座標）
export interface Drop {
  list: string
  before?: string
  bar: { x: number; y: number; w: number }
}

// ポインタ（画面の座標）の下のリストで、チェック済みか（checked）の行 row を落とす所（無ければ null）。行の並びは画面に見えている順。行の真ん中より上なら、その行の前。
// チェック済みを寄せて見せているリストでは、落とせるのはその行が寄せられる組の中だけ（rows.ts の dropPlace）。
// ポインタの高さと光る線は、行の並びの見えている範囲（スクロールする所）の中に収める（範囲の外の行の間には出さない）
export function dropAt(x: number, pointerY: number, row: string, checked: boolean): Drop | null {
  const under = document.elementsFromPoint(x, pointerY)
  const frame = under.map(el => el.closest("[data-list-frame]")).find(Boolean)
  const ul = frame?.querySelector<HTMLElement>("[data-list-rows]")
  const list = ul?.dataset.listRows
  if (!ul || !list) return null
  const box = ul.getBoundingClientRect()
  const view = (ul.parentElement ?? ul).getBoundingClientRect()
  const y = clamp(pointerY, view.top, view.bottom)
  const others = [...ul.querySelectorAll<HTMLElement>(":scope > [data-row]")].filter(li => li.dataset.row !== row)
  const li = new Map(others.map(el => [el.dataset.row ?? "", el]))
  const gather = (ul.dataset.gather ?? "none") as "none" | "first" | "last"
  const rows = others.map(el => ({
    id: el.dataset.row ?? "",
    checked: el.dataset.checked === "true",
    order: Number(el.dataset.order),
  }))
  const place = dropPlace(rows, gather, checked, id => {
    const r = li.get(id)?.getBoundingClientRect()
    return r !== undefined && y < r.top + r.height / 2
  })
  const rect = (id: string) => li.get(id)?.getBoundingClientRect()
  const bar = place.bar
  const gap =
    "before" in bar
      ? (rect(bar.before)?.top ?? box.top) - GAP_MID
      : "after" in bar
        ? (rect(bar.after)?.bottom ?? box.top) + GAP_MID
        : others.length > 0
          ? (others[0]?.getBoundingClientRect().top ?? box.top) - GAP_MID
          : box.top + INSET_MID
  return {
    list,
    ...(place.before ? { before: place.before } : {}),
    bar: { x: box.left + 8, y: clamp(gap, view.top + BAR_HALF, view.bottom - BAR_HALF), w: box.width - 16 },
  }
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const GAP_MID = 3 // 行の間の隙間（6px）の真ん中
const INSET_MID = 4 // 行の無いリストの、台紙の内側の余白の真ん中
export const BAR_HALF = 2 // 光る線の太さ（4px）の半分
