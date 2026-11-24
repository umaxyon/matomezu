// 書庫の行の押し方: ブックスクリーンに開く行（ページの在るブックと、ブックの中のページ）は、クリックで「開く／分割で開く」の吹き出し、
// ダブルクリックで開く。ほかの行は、クリックで行う事とダブルクリックで開く事だけ（書庫の右の枠・ツリー・検索の結果が共に使う）
import { type MouseEvent, type ReactNode, useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useMatomezuState } from "../../../ui/store-context"
import { BOOK_SCREEN_DEF } from "../window"
import { useBookOpenChoice } from "../window/useBookOpenChoice"
import { useScreenSplit } from "../window/useScreenSplit"
import { useWorkdesks } from "./hooks"
import { type BookOpened, bookOpenedFrom, type LibraryRow } from "./outline"
import { LIBRARY_SCREEN } from "./screen"

// 書庫の行 row を開くと出すブックとページ（bookOpenedFrom）と、ブックスクリーンと上下に並んでいるか（beside）。
// 「画面を分割」で出した書庫のスクリーンでは答えない（開く先が上の段の空のステージに決まっていて、「分割で開く」と重なる）
function useBookOpenedFrom(row: LibraryRow): { opens: BookOpened; beside: boolean } | undefined {
  const desks = useWorkdesks()
  const split = useScreenSplit()
  const beside = split.inSplit && split.defs.includes(BOOK_SCREEN_DEF.id)
  const pending = beside && split.here.def === LIBRARY_SCREEN.id
  const opens = useMatomezuState(useShallow(s => (pending ? undefined : bookOpenedFrom(s.folders, row, desks))))
  return useMemo(() => (opens === undefined ? undefined : { opens, beside }), [opens, beside])
}

// 行の押し方 press（クリック・ダブルクリック・「開く／分割で開く」の吹き出し）
export interface RowPress {
  onClick: (e: MouseEvent<HTMLElement>) => void
  onDoubleClick: (() => void) | undefined
  bubble: ReactNode
}

// 行 row の押し方を children に渡して描く: ブックスクリーンに開く行（ページの在るブックと、ブックの中のページ）は、クリックで行を選ぶ物 click を行ってから
// 「開く／分割で開く」、ダブルクリックで開く（open）。ほかの行は、クリックで click、ダブルクリックで open
export function RowPressOf({
  row,
  click,
  open,
  children,
}: PressOptions & { row: LibraryRow; children: (p: RowPress) => ReactNode }) {
  const found = useBookOpenedFrom(row)
  return found === undefined ? (
    <>{children({ onClick: () => click(), onDoubleClick: open, bubble: null })}</>
  ) : (
    <BookPress opens={found.opens} beside={found.beside} click={click} open={open}>
      {children}
    </BookPress>
  )
}

interface PressOptions {
  click: () => void
  open: () => void
}

// ブックスクリーンと上下に並んでいる（beside）ときの全画面で開くは、出したブックスクリーンを窓いっぱいにし、並びの物は開いたまま見えなくする（書庫の開くは、並びのブックスクリーンに開く）
function BookPress({
  opens,
  beside,
  click,
  open,
  children,
}: PressOptions & { opens: BookOpened; beside: boolean; children: (p: RowPress) => ReactNode }) {
  const choice = useBookOpenChoice({
    ...opens,
    ...(beside ? { fullOverRows: true } : { full: open }),
    onClick: click,
  })
  return <>{children({ onClick: choice.onClick, onDoubleClick: undefined, bubble: choice.bubble })}</>
}
