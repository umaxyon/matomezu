// 横断検索: 画面がホストに頼む検索の頼みと答えの形。
// 探す仕組みはホストの 1 か所で、画面はその答えをそのまま使う（頼み方の URL と答えの確かめは host-client/search.ts）
import type { UnlistedMode } from "./ai-list"

export interface WideSearchQuery {
  terms: readonly string[] // 言葉（どれかに当たれば横断検索の当たり）
  kinds?: readonly string[] // 探す種類の id（無ければ探せる種類の全部）
  limit?: number
  offset?: number
  unlisted?: UnlistedMode // 載せない物（一覧の既定の目次に載せない物）の扱い。画面の口の既定は include
}

export interface WideSearchHit {
  kind: string
  id: string
  part: string
  brief: string
  snippet: string
  label?: string // 何に当たったかの名前（そのレコードの searchTexts の title。無ければ親の title。どちらも無ければ省く）
  of?: { kind: string; id: string } // 当たったレコードの親
}

export interface WideSearchAnswer {
  total: number
  hits: readonly WideSearchHit[]
  more?: number // 上限で切れた、残りの数
  next?: number // 続きの offset
}

export const NO_WIDE_SEARCH_HITS: WideSearchAnswer = { total: 0, hits: [] }
