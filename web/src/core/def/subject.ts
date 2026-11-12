// 対象の定義: プラグインが足す、アクションの対象の種類。この種類のデータは「レコード」で、1 件が 1 つのまとまり（id を持つ）。
// core は中を読まず、種類ごとにレコードを入れ物として持つ。確かめは record の形（Zod）1 つ。レコードは 1 件ずつ版を持って保存される（ブックと同じ）。
// アクションは target に種類の id を書き、on の record で 1 件を指して行う（指さなければ新しいレコードを作る）。ゴミ箱は無い（消したら無くなる）
import type { z } from "zod"
import type { SubjectExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"

// 常駐が読む種類の役。参加者（participants）とワークルーム（workrooms）は、常駐（join・話しかけのフック）が読むので、定義が役を名乗り、常駐は役で種類を引く。
// 役ごとに 1 つの種類だけが名乗り、常駐が読むフィールドを record に持つ（SUBJECT_ROLE_FIELDS。台帳アセンブルのときに確かめる）
export const SUBJECT_ROLE_FIELDS = {
  participants: ["id", "state", "ai", "model", "env", "sessionName", "link", "workroom"],
  workrooms: ["id", "name"],
} as const
export type SubjectRole = keyof typeof SUBJECT_ROLE_FIELDS

export interface SubjectDef<R extends z.ZodObject = z.ZodObject, Tt extends string = MessageKey> extends SubjectExtras {
  id: string // 本当の id（例: @matomezu/example:note）
  title: Tt
  aiDescription: string // AI 向けの説明（英語。MCP の actions の subjects で見せる。何のレコードで、AI がどう行うか）
  record: R // レコード 1 件の形。id（文字）を持つ
  // このレコードが指す、ほかのレコード（種類の id と id。レコードの中を読むのはこの定義だけ）。認可ステップが、行った後の実際のレコードの参照で守るのに使う（指す種類は、アクションの reads に書く）
  refers?(record: z.output<R>): readonly { subject: string; id: string }[]
  role?: SubjectRole // 常駐が読む種類の役（参加者・ワークルーム）
  numbered?: true // レコードに番号を振る種類。アクションは ctx.number(区切り) で次の番号を受け取る（常駐が決める。区切りごとに連番で、使い回さない）
}
