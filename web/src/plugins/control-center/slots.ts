// コントロールセンターが開くスロットの名前（control-center の ui.tsx で、core/catalog.ts の SlotTable に書き足す）。
// ほかのプラグインは、ここを読まず id で選ぶ
import { kit } from "./kit"

// 左の列の、利用者パネルと参加者の一覧の間に並べるウィジェットを置くスロット（プロジェクトの一覧など）。何も受け取らない
export const SIDE = kit.name("side")
// 左の列の、参加者の一覧の下に並べるウィジェットを置くスロット（ほかのホストなど）。選んでいる物（PICKED。無ければ NO_STATE）を受け取る
export const BELOW_PARTICIPANTS = kit.name("below-participants")
// 右の下の枠に、選んでいる物を描くウィジェットを置くスロット。ワークルームとビジターのほかの種類のうち、選んだ物の種類を名乗る（forKind）1 つだけを描く。そのレコードの id を受け取る
export const PICKED_DETAIL = kit.name("picked-detail")
// プロジェクトの画面の上の領域に置くウィジェットを置くスロット（タスクボードなど）。何も受け取らない
export const PROJECTS = kit.name("projects")
// ワークルームの枠に、情報の列の右に並べる列のウィジェットを置くスロット（カレントチケット・チケット履歴など）。選んでいるワークルームの id を受け取る
export const WORKROOM_COLUMNS = kit.name("workroom-columns")
// 参加者の一覧の、参加済みの行の下の 1 行に出すウィジェットを置くスロット（今のタスクなど）。その行のワークルームの id と、管理者かを受け取る
export const WORKROOM_ROW_LINE = kit.name("workroom-row-line")
