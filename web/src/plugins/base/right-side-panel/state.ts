// 右サイドパネルを開いているかの、base のステージの画面の状態での持ち方: 開いたステージの rightSidePanel に、出している中身と開いた所を持つ。
// 窓に 1 つだけで、ブックのデータにも URL にも入れない
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

// 開いたときのブックとページが、今ステージで開いているものと同じか（違えば、右サイドパネルは閉じる）
export const stillOn = (open: RightSidePanelOpen, stage: Pick<Stage, "opened">): boolean =>
  stage.opened?.book === open.book && (stage.opened?.page ?? null) === open.page

// 分けたステージの列の伸び（flex-grow）: 右サイドパネルを開いていれば、開いたステージ panel が 1・もう片方が 0。開いていなければ分けた割合 share
export const columnGrow = (stage: string, i: number, panel: string | null, share: number): number =>
  panel !== null ? (stage === panel ? 1 : 0) : i === 0 ? share : 1 - share

// 押しで右サイドパネルを閉じるか: 左ボタンで、右サイドパネルの外の、閉じない所（ダイアログ・メニューなど）でもない所を、ずらす道具でない間に押したとき
export const pressCloses = (press: { button: number; inside: boolean; kept: boolean; pans: boolean }): boolean =>
  press.button === 0 && !press.inside && !press.kept && !press.pans
