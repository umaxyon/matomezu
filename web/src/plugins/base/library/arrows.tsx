// 書庫の画面の行のボタンが、ビューで直に受けるキー: Enter（開く）と、右の枠の上下の矢印（焦点のある行から、上・下の並びのいちばん近い行を選んで、焦点を移す）。
// 上・下の並びは描いた後の幅で決まるので、ビューが受ける（左右の矢印・ツリーの矢印は、コマンドとキーバインド）。行は data-library-row を名乗るボタン
import type { KeyboardEvent } from "react"

const ROW = "[data-library-row]"

// 行のボタンの上の Enter は、押す（選ぶ）代わりに開く（2 回押すのと同じ）
export function openOnEnter(e: KeyboardEvent, open: () => void): void {
  if (e.key !== "Enter" || e.nativeEvent.isComposing) return
  e.preventDefault()
  open()
}

// pick は、行 id を選ぶ
export function rowAboveOrBelow(e: KeyboardEvent<HTMLElement>, pick: (id: string) => void): void {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
  const at = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>(ROW) : null
  if (!at) return
  e.preventDefault()
  const here = at.getBoundingClientRect()
  const down = e.key === "ArrowDown"
  // 上（下）に在る行のうち、いちばん近い並び
  const beyond = [...e.currentTarget.querySelectorAll<HTMLElement>(ROW)]
    .map(row => ({ row, box: row.getBoundingClientRect() }))
    .filter(({ box }) => (down ? box.top > here.top + 1 : box.top < here.top - 1))
  const edge = down ? Math.min(...beyond.map(b => b.box.top)) : Math.max(...beyond.map(b => b.box.top))
  const near = beyond
    .filter(b => Math.abs(b.box.top - edge) < 1)
    .sort((a, b) => Math.abs(a.box.left - here.left) - Math.abs(b.box.left - here.left))[0]
  const id = near?.row.dataset.libraryRow
  if (!near || id === undefined) return
  near.row.focus()
  pick(id)
}
