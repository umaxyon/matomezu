// 左ドロワーを開いているかの、base のステージの画面の状態での持ち方: 開いたステージの leftDrawer に、開いているタブのウィジェットの id を持つ

// ステージの画面の状態 state で開いている左ドロワーのタブ（閉じていれば null）
export const leftDrawerIn = (state: unknown): string | null =>
  (state as { leftDrawer?: string } | undefined)?.leftDrawer ?? null

// ステージの画面の状態 state の左ドロワーを、タブ tab を開いた形にする（null なら閉じる）
export function withLeftDrawer(state: unknown, tab: string | null): Record<string, unknown> {
  const { leftDrawer: _, ...rest } = (state as Record<string, unknown> | undefined) ?? {}
  return tab ? { ...rest, leftDrawer: tab } : rest
}

// 押しで左ドロワーを閉じるか: 左ボタンで、左ドロワーの中でも、閉じない所（ダイアログ・メニュー・トースト・開くボタン）でもない所を押したとき
export const leftDrawerPressCloses = (press: { button: number; inside: boolean; kept: boolean }): boolean =>
  press.button === 0 && !press.inside && !press.kept
