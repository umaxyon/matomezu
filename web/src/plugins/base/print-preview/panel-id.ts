// 印刷プレビューの右サイドパネルの中身（ウィジェット print-preview-panel）の id。開くコマンドと中身の両方が読む
import { kit } from "../kit"

export const PRINT_PREVIEW_PANEL_ID = kit.name("print-preview-panel")

// 印刷の前のチェックの右サイドパネルの中身（ウィジェット print-check-panel）の id
export const PRINT_CHECK_PANEL_ID = kit.name("print-check-panel")

// ブック book の、印刷の前のチェックの右サイドパネルを開くときの中身（右サイドパネルの開いている物。付いた先は持たない）
export const printCheckOpen = (book: string) => ({
  widget: PRINT_CHECK_PANEL_ID,
  subject: book,
  anchors: [] as readonly string[],
  current: book,
})
