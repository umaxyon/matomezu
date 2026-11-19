// 書庫の画面の右の枠の、上下の矢印キー: 焦点のある行から、上・下の段のいちばん近い行を選んで、焦点を移す。
// 段の並びは描いた後の幅で決まるので、ビューが受ける（左右の矢印・ツリーの矢印は、コマンドとキーバインド）。行は data-library-row を名乗るボタン
import type { KeyboardEvent } from "react"

const ROW = "[data-library-row]"

export function rowAboveOrBelow(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
  const at = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>(ROW) : null
  if (!at) return
  e.preventDefault()
  const here = at.getBoundingClientRect()
  const down = e.key === "ArrowDown"
  // 隣の段: 上（下）に在る行のうち、いちばん近い段
  const beyond = [...e.currentTarget.querySelectorAll<HTMLElement>(ROW)]
    .map(row => ({ row, box: row.getBoundingClientRect() }))
    .filter(({ box }) => (down ? box.top > here.top + 1 : box.top < here.top - 1))
  const edge = down ? Math.min(...beyond.map(b => b.box.top)) : Math.max(...beyond.map(b => b.box.top))
  const near = beyond
    .filter(b => Math.abs(b.box.top - edge) < 1)
    .sort((a, b) => Math.abs(a.box.left - here.left) - Math.abs(b.box.left - here.left))[0]
  near?.row.focus()
  near?.row.click()
}
