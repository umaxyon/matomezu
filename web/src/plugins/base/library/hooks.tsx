// 書庫の画面のビューが共に使うフック: 書庫の表から出した行を同じ値のまま保つ・行の名前・焦点を中に保つ
import { type RefObject, useEffect, useRef } from "react"
import { HOME_ID, type Library, TRASH_ID } from "../../../core/folders"
import { sameData } from "../../../core/same"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { type LibraryRow, NO_TITLE } from "./outline"

// 書庫の表から rowsOf で出した行。表が変わっても、行の中身が同じなら同じ値のまま（ページの中身が変わるたびに描き直さない）。
// key は、rowsOf が何の行を出すかを分ける値（フォルダの id など。変わったら出し直す）
export function useLibraryRows<R>(key: string, rowsOf: (library: Library) => readonly R[]): readonly R[] {
  const kept = useRef<{ key: string; pages: unknown; folders: unknown; rows: readonly R[] } | null>(null)
  return useMatomezuState(s => {
    const was = kept.current?.key === key ? kept.current : null
    if (was && was.pages === s.pages && was.folders === s.folders) return was.rows
    const next = rowsOf(s)
    const rows = was && sameData(was.rows, next) ? was.rows : next
    kept.current = { key, pages: s.pages, folders: s.folders, rows }
    return rows
  })
}

// 行の名前: 書庫ホームとゴミ箱は画面の言葉、名前の無い物は id を添える
export function useNameOf(): (row: Pick<LibraryRow, "id" | "title">) => string {
  const t = useMessages(kit)
  return row =>
    row.id === HOME_ID
      ? t("Library")
      : row.id === TRASH_ID
        ? t("Trash")
        : row.title !== NO_TITLE
          ? row.title
          : t("Untitled ({id})", { id: row.id })
}

// 要素 root の中に焦点があるうちに、焦点のある要素が消えたら（行えて行が消えた・元に戻すで行が消えた、など）、焦点を root に置き直す
// （焦点が body に落ちると、root が名乗るキーの範囲のキーが効かなくなるため）。利用者が root の外へ焦点を移したら、置き直さない
export function useKeepFocusIn(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = root.current
    if (!el) return
    let inside = el.contains(document.activeElement)
    const onIn = () => {
      inside = true
    }
    // 中の要素が消えたときは、行き先の無い focusout が来るか、何も来ない。行き先が外の要素のときだけ、外へ移したと見る
    const onOut = (e: FocusEvent) => {
      if (e.relatedTarget instanceof Node && !el.contains(e.relatedTarget)) inside = false
    }
    const onPress = (e: PointerEvent) => {
      if (e.target instanceof Node && !el.contains(e.target)) inside = false
    }
    const seen = new MutationObserver(() => {
      if (inside && (document.activeElement === document.body || document.activeElement === null)) el.focus()
    })
    el.addEventListener("focusin", onIn)
    el.addEventListener("focusout", onOut)
    document.addEventListener("pointerdown", onPress, true)
    seen.observe(el, { childList: true, subtree: true })
    return () => {
      el.removeEventListener("focusin", onIn)
      el.removeEventListener("focusout", onOut)
      document.removeEventListener("pointerdown", onPress, true)
      seen.disconnect()
    }
  }, [root])
}
