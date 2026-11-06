// 伝言を出す右サイドパネルの中身（ウィジェット note-panel）の id。開く側（伝言のレイヤー）と中身の両方が読む
import { kit } from "../kit"

export const NOTE_PANEL_ID = kit.name("note-panel")

// 右サイドパネルの subject に置く、まだ付けていない伝言（新しく書いている）を表す値（伝言の id とぶつからないよう、頭を付ける）
export const NEW_NOTE = kit.name("new-note")

// コーナーステータス（スロット corner-statuses に置くウィジェット）の id: たたんだ伝言と、既読の伝言
export const FOLDED_NOTE_STATUS_ID = kit.name("folded-note-status")
export const READ_NOTE_STATUS_ID = kit.name("read-note-status")
