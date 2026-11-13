// 対象の定義: プラグインが足す、アクションの対象の種類。この種類のデータは「レコード」で、1 件が 1 つのまとまり（id を持つ）。
// core は中を読まず、種類ごとにレコードを入れ物として持つ。確かめは record の形（Zod）1 つ。レコードは 1 件ずつ版を持って保存される（ブックと同じ）。
// アクションは target に種類の id を書き、on の record で 1 件を指して行う（指さなければ新しいレコードを作る）。ゴミ箱は無い（消したら無くなる）
import type { z } from "zod"
import type { SubjectExtras } from "../catalog"
import type { CoreCatalog } from "../core-catalog"
import type { MessageKey } from "../i18n/i18n"
import type { Order } from "../record-keys"
import type { Warning } from "../warnings"

// 常駐が種類で引く役。参加者（participants）とワークルーム（workrooms）は常駐（join・話しかけのフック）が読む。定義が役を名乗り、常駐は役で種類を引く。
// 役ごとに 1 つの種類だけが名乗り、読むフィールドを record に持つ（SUBJECT_ROLE_FIELDS。台帳アセンブルのときに確かめる）
export const SUBJECT_ROLE_FIELDS = {
  participants: ["id", "state", "ai", "model", "env", "sessionName", "link", "workroom", "requestedAt"],
  workrooms: ["id", "name"],
} as const
export type SubjectRole = keyof typeof SUBJECT_ROLE_FIELDS

// 索引キー 1 つ: 値の型と、レコードから値を返す関数（値の無いレコードは何も返さない）。条件と並びに書けるのは、宣言した索引キーだけ（core/record-keys.ts）
export interface RecordKeyDef<Rec = never> {
  type: "text" | "number"
  of(record: Rec): string | number | undefined
}

// 索引キーの宣言の組（名前 → 宣言）
export type SubjectKeys<Rec = never> = Readonly<Record<string, RecordKeyDef<Rec>>>
// 名前 → 値の型（text か number）の組と、レコードの形 R から、索引キーの宣言の組の型を作る（kit.defineSubject が、書いた宣言から値の型だけを読み取るのに使う）
export type KeysOfTypes<Kt extends Readonly<Record<string, RecordKeyDef["type"]>>, R extends z.ZodObject> = {
  readonly [N in keyof Kt]: {
    type: Kt[N]
    of(record: z.output<R>): (Kt[N] extends "number" ? number : string) | undefined // 返す値は、宣言した型（text なら字・number なら数）
  }
}

// Ks は索引キーの宣言の組の型（kit.defineSubject が書いたとおりに残す。条件・並び・ctx.keys の型は、ここから決まる。core/record-keys.ts の KeyNameOf など）
export interface SubjectDef<
  R extends z.ZodObject = z.ZodObject,
  Tt extends string = MessageKey,
  Ks extends SubjectKeys<z.output<R>> = SubjectKeys<z.output<R>>,
> extends SubjectExtras {
  id: string // 本当の id（例: @matomezu/example:note）
  title: Tt
  aiDescription: string // AI 向けの説明（英語。MCP の actions の subjects で見せる。何のレコードで、AI がどう行うか）
  record: R // レコード 1 件の形。id（文字）を持つ
  // このレコードが指す、ほかのレコード（種類の id と id。レコードの中を読むのはこの定義だけ）。認可ステップが、行った後の実際のレコードの参照で守るのに使う（指す先は core が読むので、アクションの reads に書かなくてよい）
  refers?(record: z.output<R>): readonly { subject: string; id: string }[]
  role?: SubjectRole // 常駐が種類で引く役（参加者・ワークルーム）
  // レコード 1 件の、形（record）のほかの確かめ。効かない所があれば warning を返す（無ければ空）。書いた種類は、形の確かめもここで行う（形に合わないレコードも渡る）。
  // アクションの結果は、warning が 1 つでもあれば断り、残したレコードは、この warning を一覧に持つ（データには手を付けない）
  check?(record: unknown, catalog: CoreCatalog): readonly Warning[]
  // 索引キー（名前 → 宣言）。保存が中身とは別に持ち、中身を開けずに探すのに使う
  keys?: Ks
  // AI に見せる種類（read_records）の目次の 1 行（id とともに並ぶ題）。書いた種類だけが AI に見える（書かなければ AI には見せない）。aiListed は目次に載せるか（無ければ載せる）
  aiBrief?(record: z.output<R>, catalog: CoreCatalog): string
  aiListed?(record: z.output<R>): boolean
  // 一覧（read_records）の並びの鍵（小さい順。無ければ id の順）
  aiOrder?(record: z.output<R>): number
  // 一覧（read_records）の既定の並び（索引キー）と件数。書いた種類の一覧は、索引キーで探して並べ、その件数だけ中身を読む
  // （続きは before で取る。条件に書けるのは索引キーだけ）。書かなければ、種類の全部を読んで aiOrder の順に並べる
  aiList?: { order: Order<keyof Ks & string>; limit: number }
  // 一覧（read_records）の 1 行に、id と題のほかに添えるフィールド（見分けに要る物だけ。aiList を書いた種類だけが使える）
  aiRow?(record: z.output<R>): Readonly<Record<string, unknown>>
  numbered?: true // レコードに番号を振る種類。アクションは ctx.number(区切り) で次の番号を受け取る（常駐が決める。区切りごとに連番で、使い回さない）
}
