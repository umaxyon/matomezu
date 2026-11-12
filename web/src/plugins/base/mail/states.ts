// 郵便のプラグイン状態の宣言: 行き先を開いた郵便の行き先の物（鳥を連れてきている間だけ持つ）
import { kit } from "../kit"

export interface BirdVisit {
  mail: string // 行き先を開いた郵便の id
  seq: number // 開いた回ごとに増える番号（同じ郵便をもう一度開いたら、鳥を連れてき直す）
  book: string
  page: string | null
  ids: readonly string[]
}

export const MAIL_BIRD_VISIT = kit.definePluginStateOf<BirdVisit>()({ id: "mail-bird-visit", scope: "stage" })

export const MAIL_STATES = [MAIL_BIRD_VISIT] as const
