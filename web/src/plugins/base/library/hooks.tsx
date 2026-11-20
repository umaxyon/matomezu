// 書庫の画面のビューが共に使うフック: 書庫の表から出した行を同じ値のまま保つ・行の名前・焦点を中に保つ
import { type RefObject, useEffect, useRef } from "react"
import { type EntryKind, type Naming, namingOf } from "../../../core/entries"
import { type BROKEN, HOME_ID, type Library, TRASH_ID, UNREADABLE_ID } from "../../../core/folders"
import { sameData } from "../../../core/same"
import type { MovedIfOff, Purged } from "../../../core/unreadable"
import type { MatomezuState } from "../../../store/state"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useInstance, useMatomezuState, useReadState } from "../../../ui/store-context"
import { kit } from "../kit"
import { type LibraryRow, NO_TITLE, rowsIn } from "./outline"

// 書庫の表から rowsOf で出した行（名前は、利用者の設定の言語で引く naming で引く。読めない物のフォルダの直下の物 unreadableFolder も読める）。
// 表と設定と読めない物のフォルダが変わっても、行の中身が同じなら同じ値のまま（ページの中身が変わるたびに描き直さない）。
// key は、rowsOf が何の行を出すかを分ける値（フォルダの id など。変わったら出し直す）
export function useLibraryRows<R>(
  key: string,
  rowsOf: (library: Library & Pick<MatomezuState, "unreadableFolder">, naming: Naming) => readonly R[],
): readonly R[] {
  const catalog = useCatalog().core
  const kept = useRef<{
    key: string
    pages: unknown
    folders: unknown
    settings: unknown
    unreadableFolder: unknown
    rows: readonly R[]
  } | null>(null)
  return useMatomezuState(s => {
    const was = kept.current?.key === key ? kept.current : null
    if (
      was &&
      was.pages === s.pages &&
      was.folders === s.folders &&
      was.settings === s.settings &&
      was.unreadableFolder === s.unreadableFolder
    )
      return was.rows
    const next = rowsOf(s, namingOf(catalog, s.settings))
    const rows = was && sameData(was.rows, next) ? was.rows : next
    kept.current = {
      key,
      pages: s.pages,
      folders: s.folders,
      settings: s.settings,
      unreadableFolder: s.unreadableFolder,
      rows,
    }
    return rows
  })
}

// 今の書庫の名前を引く決まり（利用者の設定の言語）を、呼んだときに読む関数
export function useReadNaming(): () => Naming {
  const catalog = useCatalog().core
  const read = useReadState()
  return () => namingOf(catalog, read().settings)
}

// フォルダの直下のエントリ 1 つ: id・種類・名前（名前の無い物は空の文字列）
export interface FolderEntry {
  id: string
  kind: EntryKind
  name: string
}

// フォルダ folder（書庫ホーム・ゴミ箱・フォルダ・ブック・バインダ）の直下のエントリ（並びの順）。フォルダが無ければ undefined
export function useFolderEntries(folder: string): readonly FolderEntry[] | undefined {
  const entries = useLibraryRows(folder, (s, naming) =>
    rowsIn(s, folder, naming).map((r): FolderEntry => ({ id: r.id, kind: r.kind, name: r.title })),
  )
  return useMatomezuState(s => s.folders[folder] !== undefined) ? entries : undefined
}

// 行の名前: 書庫ホームとゴミ箱と読めない物のフォルダは画面の言葉、ブックごと読めないブックは読めない訳に残った名前、名前の無い物は id を添える
export function useNameOf(): (row: Pick<LibraryRow, "id" | "title">) => string {
  const t = useMessages(kit)
  const unreadable = useMatomezuState(s => s.unreadable)
  return row => {
    if (row.id === HOME_ID) return t("Library")
    if (row.id === TRASH_ID) return t("Trash")
    if (row.id === UNREADABLE_ID) return t("Unreadable")
    if (row.title !== NO_TITLE) return row.title
    // ブックごと読めないブックは書庫の表に行が無いので、読めない訳（warning）に残った名前
    const title = unreadable.find(w => w.params.book === row.id)?.params.title
    return title !== undefined && title !== NO_TITLE ? title : t("Untitled ({id})", { id: row.id })
  }
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

// 押した所が行の外か（何も無い所を押して選んでいる行を外すときに使う。選んだ行に出すボタンの並びは、行の内側）
export const outsideRow = (target: EventTarget): boolean =>
  target instanceof Element && target.closest("[data-library-row], [data-library-row-actions]") === null

// 追加プラグイン ids を無効にしたら読めない物のフォルダへ移る物を、ホストに書かずに数えてもらう（ホストが無いか、頼めなければ投げる）
export function useMovedIfOff(): (ids: readonly string[]) => Promise<readonly MovedIfOff[] | typeof BROKEN> {
  return useInstance().movedIfOff
}

// 読めない物のフォルダの直下の物 id を完全に消すのをホストに頼む（ホストが無いか、頼めなければ投げる）
export function usePurgeUnreadable(): (id: string) => Promise<Purged> {
  return useInstance().purgeUnreadable
}
