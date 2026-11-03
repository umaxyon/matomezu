// 伝言を出す右サイドパネルの中身（ウィジェット note-panel）の id。開く側（伝言のレイヤー）と中身の両方が読む
import { kit } from "../kit"

export const NOTE_PANEL_ID = kit.name("note-panel")

// 右サイドパネルの subject に置く、まだ付けていない伝言（新しく書いている）を表す値
export const NEW_NOTE = "new"
