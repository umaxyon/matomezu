// フォローステップ: ある種類のレコード（ほかのプラグインの物でもよい）が変わったら、その前と後を受けて、自分のプラグインのレコードの変わりを返す口。
// perform が、レコードを変えたアクションのあとに、同じアクションの変わりとして当てる（同じトランザクション。画面がその場で行うときも、常駐が行うときも同じ）。
// 応じる側は断れない（変わりを返すだけ）。応じた変わりは、きっかけのアクションを行った者の認可ステップには止められない（followed を持つ認可ステップだけがかかる）。
// フォローステップが書く種類を、ほかのフォローステップが見てもよい（依る順に当てる）が、自分に返ってくる鎖は台帳アセンブルで断る
import type { SubjectId } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { ActionContext, OtherRecord, RecordOf, RecordRead } from "./action"

// 応じる変わり 1 つ: 種類 subject の id のレコードが、before（作ったなら none）から after（消したなら removed）に変わった
export interface FollowedChange<W extends SubjectId = SubjectId> {
  subject: W
  id: string
  before: RecordOf<W> | "none"
  after: RecordOf<W> | "removed"
}

// 応じる側が受ける文脈: きっかけのアクションの時点・日付・id の振り方と、読む物（reads が答えた物）。行った者は渡さない（行った者で結果を変えない）
export type FollowContext = Pick<ActionContext, "lang" | "now" | "today" | "newId"> &
  Required<Pick<ActionContext, "records" | "keys">> & {
    catalog: CoreCatalog
    // 読む物に書いた種類のレコードを id で 1 件読む（無ければ none）
    record(subject: string, id: string): unknown
  }

export interface FollowStepDef<W extends SubjectId = SubjectId> {
  watches: W // 見る種類
  // 書く種類（自分のプラグインの種類だけ。番号を振る種類は書けない）
  writes: readonly SubjectId[]
  // 読む物（変わりごとに答える。アクションの reads と同じ形）。読み口は、きっかけのアクションと、それまでに応じた変わりのあとの値を返す
  reads?(change: FollowedChange<W>): readonly RecordRead[]
  // 変わり change に応じて変えるレコード（writes の種類だけ。subject は省けない）
  follow(change: FollowedChange<W>, ctx: FollowContext): readonly FollowedRecord[]
}

// 応じる側が変えるレコード 1 件（record は新しいレコードか、消すなら removed）
export type FollowedRecord = Extract<OtherRecord<SubjectId>, { subject: SubjectId }>
