// フォローステップ: ある種類のレコード（ほかのプラグインの物でもよい）が変わったら、その前と後を受けて、自分のプラグインのレコードの変わりを返す口。
// perform が、レコードを変えたアクションのあとに、同じアクションの変わりとして当てる（同じトランザクション。画面がその場で行うときも、常駐が行うときも同じ）。
// 応じる側は断れない（変わりを返すだけ）。応じた変わりは、きっかけのアクションを行った者の認可ステップには止められない（followed を持つ認可ステップだけがかかる）。
// フォローステップが書く種類を、ほかのフォローステップが見てもよい（依る順に当てる）が、自分に返ってくる鎖は台帳アセンブルで断る
import type { SubjectExtras, SubjectId } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { WorkKey } from "../folders"
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

// 見る種類を、名前でなく、対象の定義の拡張ポイントのメソッドで指す形（台帳アセンブルで、そのメソッドを持つ種類の全部に解く。無ければどれも見ない）
export interface WatchesHaving {
  having: keyof SubjectExtras & string
}

export interface FollowStepDef<W extends SubjectId = SubjectId> {
  watches: W | WatchesHaving // 見る種類
  // 書く種類（自分のプラグインの種類だけ。番号を振る種類は書けない）
  writes: readonly SubjectId[]
  // 中を書くバックヤード（自分のプラグインが定義したバックヤードだけ。BackyardFollow）
  backyards?: readonly string[]
  // 読む物（変わりごとに答える。アクションの reads と同じ形）。読み口は、きっかけのアクションと、それまでに応じた変わりのあとの値を返す
  reads?(change: FollowedChange<W>, catalog: CoreCatalog): readonly RecordRead[]
  // 変わり change に応じて変える物: レコード（writes の種類だけ）と、バックヤードの中の物（backyards のバックヤードだけ）と、送る常駐メッセージ
  follow(change: FollowedChange<W>, ctx: FollowContext): FollowOut
}

// 応じる側が返す物（変えないなら空）
export interface FollowOut {
  records?: readonly FollowedRecord[]
  backyard?: readonly BackyardFollow[]
  hostMessages?: readonly HostMessage[]
}

// バックヤード backyard の中の、workKey が key のブックに行う事: そのブックを完全に消す（purge。ゴミ箱にも元に戻すにも入れない）か、
// そのブックのページのアノテーションを全部消す（clear-annotations）。そのブックが無ければ何もしない
export interface BackyardFollow {
  backyard: string
  key: WorkKey
  does: "purge" | "clear-annotations"
}

// 常駐メッセージ 1 通: 宛先のワークルームの id と文（AI に見せる英語）。送り手は常駐で、行った者に関わらず送る。
// 常駐は、アクションバルクが通ったときだけ送り、宛先に参加の確定した参加者がいないときと、宛先が行った参加者のワークルームのときは送らない
export interface HostMessage {
  workroom: string
  text: string
}

// 応じる側が変えるレコード 1 件（record は新しいレコードか、消すなら removed）
export type FollowedRecord = Extract<OtherRecord<SubjectId>, { subject: SubjectId }>
