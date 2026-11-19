// 書庫の画面の矢印キー: 焦点のある行から、隣の行へ焦点を移して選ぶ（押したのと同じ）。ツリーは上下で前後の行、左右で中をしまう・出す。
// 右の枠は、左右で前後のアイコン、上下で、上・下の段のいちばん近いアイコン。行は data-library-row を名乗るボタン
import type { KeyboardEvent } from "react"

const ROW = "[data-library-row]"

// 行 to へ焦点を移して、選ぶ
function go(to: HTMLElement | undefined): void {
  if (!to) return
  to.focus()
  to.click()
}

const rowsIn = (el: HTMLElement): HTMLElement[] => [...el.querySelectorAll<HTMLElement>(ROW)]

// ツリー（要素 e.currentTarget）の中の矢印キー。toggle は、行のフォルダの中を出す・しまう
export function treeArrows(e: KeyboardEvent<HTMLElement>, toggle: (id: string) => void): void {
  const at = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>(ROW) : null
  if (!at) return
  const rows = rowsIn(e.currentTarget)
  const i = rows.indexOf(at)
  const { libraryRow: id, unfolded } = at.dataset // unfolded: 中を出していれば "true"、しまっていれば "false"、中を出せない行には無い
  if (e.key === "ArrowDown") go(rows[i + 1])
  else if (e.key === "ArrowUp") go(rows[i - 1])
  else if (e.key === "ArrowRight" && unfolded === "false" && id) toggle(id)
  else if (e.key === "ArrowRight" && unfolded === "true") go(rows[i + 1])
  else if (e.key === "ArrowLeft" && unfolded === "true" && id) toggle(id)
  else if (e.key === "ArrowLeft") go(rows.find(r => r.dataset.libraryRow === at.dataset.holder))
  else return
  e.preventDefault()
}

// 右の枠（要素 e.currentTarget）の中の矢印キー
export function contentsArrows(e: KeyboardEvent<HTMLElement>): void {
  const at = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>(ROW) : null
  if (!at) return
  const rows = rowsIn(e.currentTarget)
  const i = rows.indexOf(at)
  if (e.key === "ArrowRight") go(rows[i + 1])
  else if (e.key === "ArrowLeft") go(rows[i - 1])
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const here = at.getBoundingClientRect()
    const down = e.key === "ArrowDown"
    // 隣の段: 上（下）に在る行のうち、いちばん近い段
    const beyond = rows
      .map(r => ({ r, box: r.getBoundingClientRect() }))
      .filter(({ box }) => (down ? box.top > here.top + 1 : box.top < here.top - 1))
    const edge = down ? Math.min(...beyond.map(b => b.box.top)) : Math.max(...beyond.map(b => b.box.top))
    const near = beyond
      .filter(b => Math.abs(b.box.top - edge) < 1)
      .sort((a, b) => Math.abs(a.box.left - here.left) - Math.abs(b.box.left - here.left))[0]
    go(near?.r)
  } else return
  e.preventDefault()
}
