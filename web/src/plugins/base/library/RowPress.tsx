// 書庫の行の押し方: ブックスクリーンに開く行（ページの在るブックと、ブックの中のページ）は、クリックで「開く／分割で開く」の吹き出し、
// ダブルクリックで開く。ほかの行は、クリックで行う事とダブルクリックで開く事だけ（書庫の右の枠・ツリー・検索の結果が共に使う）。
// 参照を選んでいる間は、選べる行はクリックで［参照を置く］か［ここに置く］の吹き出し、ダブルクリックで置く。ほかの行は、クリックで行う事とダブルクリック（中へ入る物は入る）だけで、
// 選べず中へも入らない行は薄く描く（faded）
import { type MouseEvent, type ReactNode, useCallback, useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { belowOf, ChoiceBubble } from "../utils/ChoiceBubble"
import { BY_KEY, type Clicked, useClickOrDouble } from "../utils/useClickOrDouble"
import { BOOK_SCREEN_DEF } from "../window"
import { useBookOpenChoice } from "../window/useBookOpenChoice"
import { useScreenSplit } from "../window/useScreenSplit"
import { LIBRARY_CHOOSE_PLACE } from "./commands"
import { useChooseOf, useWorkdesks } from "./hooks"
import { type BookOpened, bookOpenedFrom, type LibraryRow } from "./outline"
import { LIBRARY_SCREEN } from "./screen"

// 書庫の行 row を開くと出すブックとページ（bookOpenedFrom）と、ブックスクリーンと上下に並んでいるか（beside）。
// 「画面を分割」で出した書庫のスクリーンでは答えない（開く先が上の段の空のステージに決まっていて、「分割で開く」と重なる）
function useBookOpenedFrom(
  row: Pick<LibraryRow, "id" | "kind" | "readable">,
): { opens: BookOpened; beside: boolean } | undefined {
  const desks = useWorkdesks()
  const split = useScreenSplit()
  const beside = split.inSplit && split.defs.includes(BOOK_SCREEN_DEF.id)
  const pending = beside && split.here.def === LIBRARY_SCREEN.id
  const opens = useMatomezuState(useShallow(s => (pending ? undefined : bookOpenedFrom(s.folders, row, desks))))
  return useMemo(() => (opens === undefined ? undefined : { opens, beside }), [opens, beside])
}

// 行の押し方 press（クリック・ダブルクリック・「開く／分割で開く」か選んでいる間の吹き出し・薄く描くか）
export interface RowPress {
  onClick: (e: MouseEvent<HTMLElement>) => void
  onDoubleClick: (() => void) | undefined
  bubble: ReactNode
  faded: boolean
}

// 行 row の押し方を children に渡して描く: ブックスクリーンに開く行（ページの在るブックと、ブックの中のページ）は、クリックで行を選ぶ物 click を行ってから
// 「開く／分割で開く」、ダブルクリックで開く（open）。ほかの行は、クリックで click、ダブルクリックで open
// noOpenChoice: 参照を選んでいない間は「開く／分割で開く」の吹き出しを出さず、クリックで click、ダブルクリックで open（検索の結果の名前の行）。参照を選んでいる間は、ほかの行と同じに押せる
export function RowPressOf({
  row,
  click,
  open,
  noOpenChoice,
  children,
}: PressOptions & {
  row: Pick<LibraryRow, "id" | "kind" | "readable">
  noOpenChoice?: boolean
  children: (p: RowPress) => ReactNode
}) {
  const found = useBookOpenedFrom(row)
  const choose = useChooseOf(row)
  if (choose?.chosen)
    return (
      <ChoosePress
        row={row.id}
        place={choose.choosing.choose === "referred" ? "Add reference" : "Place here"}
        click={click}
      >
        {children}
      </ChoosePress>
    )
  return found === undefined || choose !== undefined || noOpenChoice ? (
    children({ onClick: () => click(), onDoubleClick: open, bubble: null, faded: choose?.faded ?? false })
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
  return <>{children({ onClick: choice.onClick, onDoubleClick: undefined, bubble: choice.bubble, faded: false })}</>
}

// 参照を選んでいる間の、選べる行 row の押し方: クリックで行を選ぶ物 click を行ってから、置くボタン（文言 place）だけの吹き出し。ダブルクリックで置く
function ChoosePress({
  row,
  place,
  click,
  children,
}: {
  row: string
  place: "Add reference" | "Place here"
  click: () => void
  children: (p: RowPress) => ReactNode
}) {
  const t = useMessages(kit)
  const placing = useCommand(LIBRARY_CHOOSE_PLACE.id)
  const [at, setAt] = useState<{ x: number; y: number; above?: number } | null>(null)
  const close = useCallback(() => setAt(null), [])
  const put = () => placing.run({ entry: row })
  const pressed = useClickOrDouble((c: Clicked) => setAt(c.at === BY_KEY ? belowOf(c.el) : c.at), put)
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (e.detail <= 1) click()
    pressed(e)
  }
  const bubble = at ? <ChoiceBubble at={at} onClose={close} choices={[{ label: t(place), onPick: put }]} /> : null
  return <>{children({ onClick, onDoubleClick: undefined, bubble, faded: false })}</>
}
