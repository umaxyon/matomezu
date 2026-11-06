// 左サイドパネルを開いているかの、base のステージの画面の状態での持ち方: 開いたステージの leftSidePanel に、開いているタブのウィジェットの id を持つ

import { nullableItem } from "../utils/stage-item"

const LEFT_SIDE_PANEL = nullableItem<string>("leftSidePanel")

// ステージの画面の状態 state で開いている左サイドパネルのタブ（閉じていれば null）
export const leftSidePanelIn = LEFT_SIDE_PANEL.read

// ステージの画面の状態 state の左サイドパネルを、タブ tab を開いた形にする（null なら閉じる）
export const withLeftSidePanel = LEFT_SIDE_PANEL.write

// 押しで左サイドパネルを閉じるか: 左ボタンで、左サイドパネルの中でも、閉じない所（ダイアログ・メニュー・トースト・開くボタン）でもない所を押したとき
export const leftSidePanelPressCloses = (press: { button: number; inside: boolean; kept: boolean }): boolean =>
  press.button === 0 && !press.inside && !press.kept
