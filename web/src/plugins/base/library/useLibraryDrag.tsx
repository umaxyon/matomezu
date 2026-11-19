// 書庫の画面のドラッグ（フック）: 行（ツリーの行・右の枠のアイコン。data-library-row と、それを持つフォルダ data-holder を名乗る）を掴んで、
// 行の間（その位置へ）・フォルダの行の上（中へ）・ゴミ箱の行（ゴミ箱へ）に落とす。4px 動かしてから始め、落とせる先でだけ aim を持つ。
// 中をしまっているツリーの行の上で少し待つと、中を出す。Escape で取り消す。先に同じ名前の物が在れば、離したときに確かめる（asking）
import { type PointerEvent, type RefObject, useEffect, useRef, useState } from "react"
import { entriesIn } from "../../../core/entries"
import { HOME_ID, type Library, TRASH_ID } from "../../../core/folders"
import { useCommand } from "../../../ui/commands"
import { useReadState } from "../../../ui/store-context"
import { useAllowed, useAllowedOn } from "../../../ui/view-hooks"
import { DRAG_START } from "../utils"
import { LIBRARY_ENTRY_MOVE, LIBRARY_TREE_SCOPE } from "./commands"
import { type Drop, draggable, droppable, indexBefore, type MoveClash, moveClashOf } from "./drop"
import { ENTRY_MOVE } from "./entry-move"
import { ENTRY_TRASH } from "./entry-trash"
import { useReadNaming } from "./hooks"

const ROW = "[data-library-row]"
const NO_ENTRY = "-" // ドラッグしていない間に問う、無いエントリ
const UNFOLD_AFTER = 700 // 行の上で待つと中を出すまでの ms

// 落とす所: ツリーか右の枠か zone（キーの範囲の名前）の、行 row の、上（中へ）・前・後ろ
export interface Aim {
  zone: string
  row: string
  where: "into" | "before" | "after"
  drop: Drop
}
// ドラッグ中の様子: 掴んだ物と、落とす所（落とせる先の上に無ければ null）
export interface LibraryDrag {
  id: string
  aim: Aim | null
}
// 名前が重なって、確かめている移動
export interface AskingMove {
  entry: string
  into: string
  index: number | undefined
  clash: MoveClash
}

// ポインタの下の行 over と、そこへ entry を落とせるなら落とす所 aim
function aimAt(
  root: HTMLElement,
  library: Library,
  entry: string,
  x: number,
  y: number,
): { over: { zone: string; row: string } | null; aim: Aim | null } {
  const under = document.elementFromPoint(x, y)?.closest<HTMLElement>(ROW)
  const zone = under?.closest<HTMLElement>("[data-key-scope]")?.dataset.keyScope
  const { libraryRow: row, holder } = under?.dataset ?? {}
  if (!under || !root.contains(under) || !zone || !row || !holder) return { over: null, aim: null }
  const box = under.getBoundingClientRect()
  const along = zone === LIBRARY_TREE_SCOPE ? (y - box.top) / box.height : (x - box.left) / box.width
  const inside: Drop = row === TRASH_ID ? { to: "trash" } : { to: "folder", into: row }
  const enters = row !== entry && droppable(library, entry, inside)
  // 中へ入れられる行は、端の 1/4 ずつが前・後ろ。入れられない行は、半分ずつ。一番上の行（書庫ホーム・ゴミ箱）には、前も後ろも無い
  const edge = enters ? 0.25 : 0.5
  const where = holder === row ? "into" : along < edge ? "before" : along >= 1 - edge ? "after" : "into"
  const over = { zone, row }
  if (where === "into") return { over, aim: enters ? { zone, row, where, drop: inside } : null }
  const beside = entriesIn(library.folders, holder)
  const next = beside[beside.findIndex(r => r.id === row) + 1]?.id
  const index = indexBefore(library.folders, holder, entry, where === "before" ? row : next)
  const drop: Drop = { to: "folder", into: holder, index }
  return { over, aim: droppable(library, entry, drop) ? { zone, row, where, drop } : null }
}

const sameAim = (a: Aim | null, b: Aim | null): boolean =>
  a === b || (a !== null && b !== null && a.zone === b.zone && a.row === b.row && a.where === b.where)

// root は書庫の画面の根の要素。unfold は、ツリーの行 id の中を出す（もう出していれば何もしない）
export function useLibraryDrag(root: RefObject<HTMLElement | null>, unfold: (id: string) => void) {
  const read = useReadState()
  const naming = useReadNaming()
  const move = useCommand(LIBRARY_ENTRY_MOVE.id).run
  const [drag, setDrag] = useState<LibraryDrag | null>(null)
  const [asking, setAsking] = useState<AskingMove | null>(null)
  // 始める前に、動かす・ゴミ箱に入れるアクションを行えるか聞く（どちらも行えなければ、始めない）。落とす所ごとに、その引数で行えるか（ロックなど）も聞き、行えない所は落とす所にしない
  const movable = useAllowed(ENTRY_MOVE.id).ok
  const trashable = useAllowed(ENTRY_TRASH.id).ok
  const to = drag?.aim?.drop
  const entry = drag?.id ?? NO_ENTRY
  const moves = useAllowedOn(ENTRY_MOVE.id, {
    entry,
    into: to?.to === "folder" ? to.into : HOME_ID,
    index: to?.to === "folder" ? to.index : undefined,
  }).ok
  const trashes = useAllowedOn(ENTRY_TRASH.id, { entry }).ok
  const allowed = to !== undefined && (to.to === "trash" ? trashable && trashes : movable && moves)
  const live = useRef({ unfold, move, starts: movable || trashable, allowed })
  live.current = { unfold, move, starts: movable || trashable, allowed }
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])

  const drop = (entry: string, to: Drop) => {
    // 離した時点の書庫で、名前の重なりを読み直す
    const clash = moveClashOf(read(), entry, to, naming())
    if (clash && to.to === "folder") setAsking({ entry, into: to.into, index: to.index, clash })
    else live.current.move({ entry, to })
  }

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    const el = root.current
    const id = e.target instanceof Element ? e.target.closest<HTMLElement>(ROW)?.dataset.libraryRow : undefined
    if (!el || e.button !== 0 || !id || !live.current.starts || !draggable(read().folders, id)) return
    stop.current?.()
    const from = { x: e.clientX, y: e.clientY }
    let dragging = false
    let aim: Aim | null = null
    let waiting: { row: string; timer: ReturnType<typeof setTimeout> } | null = null
    const wait = (row: string | null) => {
      if (waiting?.row === row) return
      if (waiting) clearTimeout(waiting.timer)
      waiting = row === null ? null : { row, timer: setTimeout(() => live.current.unfold(row), UNFOLD_AFTER) }
    }
    const onMove = (m: globalThis.PointerEvent) => {
      if (!dragging && Math.hypot(m.clientX - from.x, m.clientY - from.y) < DRAG_START) return
      const at = aimAt(el, read(), id, m.clientX, m.clientY)
      wait(at.over?.zone === LIBRARY_TREE_SCOPE && at.over.row !== id ? at.over.row : null)
      if (dragging && sameAim(aim, at.aim)) return
      dragging = true
      aim = at.aim
      setDrag({ id, aim })
    }
    // ドラッグのあとの click は、選ぶ・開く操作にしない
    const swallow = (c: MouseEvent) => {
      c.stopPropagation()
      c.preventDefault()
    }
    const end = () => {
      wait(null)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", end)
      window.removeEventListener("keydown", onKey, true)
      stop.current = null
      if (!dragging) return
      setDrag(null)
      window.addEventListener("click", swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener("click", swallow, true))
    }
    const onUp = () => {
      const to = dragging && live.current.allowed ? aim : null
      end()
      if (to) drop(id, to.drop)
    }
    const onKey = (k: KeyboardEvent) => {
      if (k.key !== "Escape" || !dragging) return
      k.stopPropagation()
      end()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", end)
    window.addEventListener("keydown", onKey, true)
    stop.current = end
  }

  const shown = drag && !allowed && drag.aim ? { id: drag.id, aim: null } : drag
  return { drag: shown, asking, onPointerDown, answered: () => setAsking(null) }
}
