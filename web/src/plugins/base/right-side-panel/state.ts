// 右サイドパネルを開いているかの、base のステージの画面の状態での持ち方: 開いたステージの rightSidePanel に、出している中身と開いた所を持つ。
// 窓に 1 つだけで、ブックのデータにも URL にも入れない
import type { Point } from "../../../core/geom"
import type { Stage } from "../../../core/stage"

export interface RightSidePanelOpen {
  widget: string // 出している中身（右サイドパネルのスロットに置いたウィジェットの id）
  subject: string // 中身が見せている物の id（コメントなら、そのコメントの id）
  anchor: string // 見せている物が付いた先（ステージの物の id）
  book: string // 開いたときのブック
  page: string | null // 開いたときのページ
}

// base のステージの画面の状態 state の、右サイドパネル（開いていなければ null）
export const panelIn = (state: unknown): RightSidePanelOpen | null =>
  (state as { rightSidePanel?: RightSidePanelOpen } | undefined)?.rightSidePanel ?? null

// base のステージの画面の状態 state の、右サイドパネルを open にしたもの（null なら閉じる）
export function withPanel(state: unknown, open: RightSidePanelOpen | null): Record<string, unknown> {
  const { rightSidePanel: _, ...rest } = (state as Record<string, unknown> | undefined) ?? {}
  return open ? { ...rest, rightSidePanel: open } : rest
}

// ステージの見え方（倍率とずらす量）
export interface ViewAt {
  zoom: number
  pan: Point
}

// 閉じたときに見え方を戻すための覚え: 開く前の見え方とそのブックとページ、開いて物を見せた見え方（まだ見せていなければ null）、
// 開いている間に倍率かずらす量を変えたか（ページを替えても変わる）。base のステージの画面の状態の rightSidePanelRestore に持ち、
// 閉じて幅を動かし終えたら、変えていなければ戻して消す
export interface RightSidePanelRestore {
  before: ViewAt & { book: string; page: string | null }
  shown: ViewAt | null
  moved: boolean
}

export const restoreIn = (state: unknown): RightSidePanelRestore | null =>
  (state as { rightSidePanelRestore?: RightSidePanelRestore } | undefined)?.rightSidePanelRestore ?? null

// 右サイドパネルを open で開いたもの。開く前の見え方は now（閉じて戻す前に開き直したときは、最初に開く前の見え方のまま）で、物はまだ見せていない
export function withOpened(state: unknown, open: RightSidePanelOpen, now: ViewAt): Record<string, unknown> {
  const before = restoreIn(state)?.before ?? { zoom: now.zoom, pan: now.pan, book: open.book, page: open.page }
  return { ...withPanel(state, open), rightSidePanelRestore: { before, shown: null, moved: false } }
}

// 戻すための覚えを、change で変えたもの（覚えが無ければそのまま）
export function withRestore(state: unknown, change: Partial<RightSidePanelRestore>): Record<string, unknown> {
  const now = (state as Record<string, unknown> | undefined) ?? {}
  const restore = restoreIn(state)
  return restore ? { ...now, rightSidePanelRestore: { ...restore, ...change } } : now
}

// 戻すための覚えを消したもの
export function withoutRestore(state: unknown): Record<string, unknown> {
  const { rightSidePanelRestore: _, ...rest } = (state as Record<string, unknown> | undefined) ?? {}
  return rest
}

export const sameView = (a: ViewAt, b: ViewAt): boolean =>
  a.zoom === b.zoom && a.pan.x === b.pan.x && a.pan.y === b.pan.y

// 開いている間の見え方 now で、倍率かずらす量を変えたことになるか（物を見せる前は、幅を動かして変わるので数えない）
export const movedFrom = (restore: RightSidePanelRestore, now: ViewAt): boolean =>
  restore.moved || (restore.shown !== null && !sameView(restore.shown, now))

// 閉じて幅を動かし終えたときに戻す見え方（開いている間に変えたか、開く前と違うブックかページを開いていれば戻さず null）
export const restoreTo = (restore: RightSidePanelRestore, stage: Pick<Stage, "opened">): ViewAt | null =>
  restore.moved || stage.opened?.book !== restore.before.book || (stage.opened?.page ?? null) !== restore.before.page
    ? null
    : { zoom: restore.before.zoom, pan: restore.before.pan }

// 開いたときのブックとページが、今ステージで開いているものと同じか（違えば、右サイドパネルは閉じる）
export const stillOn = (open: RightSidePanelOpen, stage: Pick<Stage, "opened">): boolean =>
  stage.opened?.book === open.book && (stage.opened?.page ?? null) === open.page

// 分けたステージの列の伸び（flex-grow）: 右サイドパネルを開いていれば、開いたステージ panel が 1・もう片方が 0。開いていなければ分けた割合 share
export const columnGrow = (stage: string, i: number, panel: string | null, share: number): number =>
  panel !== null ? (stage === panel ? 1 : 0) : i === 0 ? share : 1 - share

// 押しで右サイドパネルを閉じるか: 左ボタンで、右サイドパネルの外の、閉じない所（ダイアログ・メニューなど）でもない所を、ずらす道具でない間に押したとき
export const pressCloses = (press: { button: number; inside: boolean; kept: boolean; pans: boolean }): boolean =>
  press.button === 0 && !press.inside && !press.kept && !press.pans
