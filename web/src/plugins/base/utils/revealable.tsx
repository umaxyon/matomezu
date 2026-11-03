// Revealable: 中に物を描くビューが、外から「この id の物を見えるようにして」と頼まれる口。中の物をどう見せるか（中のスクロールなど）は、実装する側だけが知る。
// 実装は、見せ方を変える要素に useRevealable の ref を付けて名乗り出る。頼む側（右サイドパネルなど）は実装を知らず、物の要素を囲む Revealable に内側から外側へ頼むだけ。
// 見せ方は画面の上の見え方だけを変え、ブックのデータは変えない。reveal から返ったときには、物の位置が決まっていること
import { useCallback, useRef } from "react"

export interface Revealable {
  reveal(id: string): void // 自分の中の id の物を、見えるようにする（自分の中に無ければ何もしない）
}

// 名乗り出た要素の印（物の要素から外側へたどって探すため）と、要素ごとの実装
const REVEALABLE_ATTR = "data-revealable"
const registered = new WeakMap<Element, { current: Revealable }>()

// revealable を名乗り出る ref を返す（見せ方を変える要素に付ける。描き直しで実装が替わっても、付け直さない）
export function useRevealable(revealable: Revealable): (el: Element | null) => void {
  const latest = useRef(revealable)
  latest.current = revealable
  const last = useRef<Element | null>(null)
  return useCallback((el: Element | null) => {
    if (last.current) {
      registered.delete(last.current)
      last.current.removeAttribute(REVEALABLE_ATTR)
    }
    last.current = el
    if (el) {
      registered.set(el, latest)
      el.setAttribute(REVEALABLE_ATTR, "")
    }
  }, [])
}

// 要素 el を囲む Revealable（outer の内側だけ）に、内側から外側の順で、id の物を見えるようにと頼む
export function revealAround(el: Element, outer: Element, id: string): void {
  const next = (at: Element) => at.parentElement?.closest(`[${REVEALABLE_ATTR}]`) ?? null
  for (let at = next(el); at && at !== outer && outer.contains(at); at = next(at))
    registered.get(at)?.current.reveal(id)
}
