// 左サイドパネルを開いているかの、base のステージの画面の状態での持ち方: 開いたステージの leftSidePanel に、開いているタブのウィジェットの id を持つ

// ステージの画面の状態 state で開いている左サイドパネルのタブ（閉じていれば null）
export const leftSidePanelIn = (state: unknown): string | null =>
  (state as { leftSidePanel?: string } | undefined)?.leftSidePanel ?? null

// ステージの画面の状態 state の左サイドパネルを、タブ tab を開いた形にする（null なら閉じる）
export function withLeftSidePanel(state: unknown, tab: string | null): Record<string, unknown> {
  const { leftSidePanel: _, ...rest } = (state as Record<string, unknown> | undefined) ?? {}
  return tab ? { ...rest, leftSidePanel: tab } : rest
}

// 押しで左サイドパネルを閉じるか: 左ボタンで、左サイドパネルの中でも、閉じない所（ダイアログ・メニュー・トースト・開くボタン）でもない所を押したとき
export const leftSidePanelPressCloses = (press: { button: number; inside: boolean; kept: boolean }): boolean =>
  press.button === 0 && !press.inside && !press.kept
