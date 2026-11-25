// コントロールセンターの定義の id（別のプラグインの定義は id で選ぶ）: スクリーン（書き先・行き先）と、巣箱のボタンの絵を引くコマンドと、
// コンテンツエリアに出す表示のプラグイン状態 content-area（値は projects・library・mailbox）
export const CONTROL_CENTER_SCREEN = "@matomezu/control-center:screen"
export const BIRDHOUSE_COMMAND = "@matomezu/base:screen-toggle"
export const CONTENT_AREA_STATE = "@matomezu/control-center:content-area"
// コントロールセンターが開くスロット: 左の列・プロジェクトの画面の上・ワークルームの枠の列・参加者の行の下の 1 行
export const CONTROL_CENTER_SIDE = "@matomezu/control-center:side"
export const CONTROL_CENTER_PROJECTS = "@matomezu/control-center:projects"
export const WORKROOM_COLUMNS = "@matomezu/control-center:workroom-columns"
export const WORKROOM_ROW_LINE = "@matomezu/control-center:workroom-row-line"
