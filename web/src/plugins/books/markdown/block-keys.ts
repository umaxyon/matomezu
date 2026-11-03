// 描いた文書のいちばん外のブロックの名前（React の key と、描き直すかの比べに使う）: 原文の中の位置を除いた中身と、同じ中身の何番目か。
// 上の方に書いて後ろのブロックの位置がずれても、中身が同じブロックは同じ名前のまま（描き直さない）
import type { MarkdownBlock } from "../../base"

const withoutRange = (key: string, value: unknown) => (key === "range" ? undefined : value)

export function blockKeys(blocks: readonly MarkdownBlock[]): string[] {
  const seen = new Map<string, number>()
  return blocks.map(b => {
    const body = JSON.stringify(b, withoutRange)
    const n = seen.get(body) ?? 0
    seen.set(body, n + 1)
    return `${n}:${body}`
  })
}
