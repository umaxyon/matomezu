// 窓のスロットの名前（base の ui.tsx で、core/catalog.ts の SlotTable に書き足す。ブックスクリーンのスロットは、定義の id がそのままスロットなので書き足さない）
import { kit } from "../kit"
import { BOOK_SCREEN_DEF } from "."

// ブックスクリーンを描くウィジェットを置くスロット（ステージの列を並べるウィジェット workspace を置く）。ブックスクリーンの定義の id そのもの
export const BOOK_SCREEN = BOOK_SCREEN_DEF.id
// カレントスクリーンがステージを並べないスクリーンの間の、下の行に並べるウィジェットを置くスロット（巣箱のボタンなど）。何も受け取らない
export const CONTROL_CENTER_FOOTER = kit.name("control-center-footer")
// コントロールセンターの左の列の、利用者パネルと参加者の一覧の間に並べるウィジェットを置くスロット（プロジェクトの一覧など）。何も受け取らない
export const CONTROL_CENTER_SIDE = kit.name("control-center-side")
// コントロールセンターのプロジェクトの画面の上の領域に置くウィジェットを置くスロット（タスクボードなど）。何も受け取らない
export const CONTROL_CENTER_PROJECTS = kit.name("control-center-projects")
// ワークルームの枠に、情報の列の右に並べる列のウィジェットを置くスロット（現在のタスク・履歴など）。選んでいるワークルームの id を受け取る
export const WORKROOM_COLUMNS = kit.name("workroom-columns")
// 参加者の一覧の、参加済みの行の下の 1 行に出すウィジェットを置くスロット（今のタスクなど）。その行のワークルームの id と、管理者かを受け取る
export const WORKROOM_ROW_LINE = kit.name("workroom-row-line")
