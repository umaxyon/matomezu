// AI が指す物（レーン・チケットタグ・担当のワークルーム）を、id か名前から 1 つに決める純粋な関数。
// 決める順は、予約語（未分類・タグなし）、id、名前（前後の空白を除いた完全一致。大文字小文字は分ける）。名前を受けても、データに残すのは id だけ。
// 見つからない・名前が 2 つ以上に当たるときは断り、選べる名前と id を断りの文に添える
import { sameName } from "../project"

export interface Candidate {
  id: string
  name: string
}

export type Resolved = { id: string } | { declined: string }

const list = (candidates: readonly Candidate[]) =>
  candidates.length === 0 ? "there is none" : `choose ${candidates.map(c => `${c.name} (${c.id})`).join(", ")}`

// ref を candidates から決める。reserved は予約語（そのまま id として通す。同じ名前の物は id で指す）。what は断りの文に使う名前（lane・tag・workroom）。
// shown は「見つからない」断りに並べる候補（無ければ candidates の全部）
export function resolve(
  ref: string,
  candidates: readonly Candidate[],
  what: string,
  reserved?: string,
  shown: readonly Candidate[] = candidates,
): Resolved {
  if (reserved !== undefined && ref === reserved) return { id: reserved }
  const byId = candidates.find(c => c.id === ref)
  if (byId) return { id: byId.id }
  const named = candidates.filter(c => sameName(c.name, ref))
  const [one] = named
  if (one && named.length === 1) return { id: one.id }
  if (named.length > 1)
    return {
      declined: `more than one ${what} is named "${ref}": point at one by its id (${named.map(c => c.id).join(", ")})`,
    }
  return { declined: `the ${what} "${ref}" is not there: ${list(shown)}` }
}
