// 本文の装飾を、入力Form の選んだ範囲に付ける・外す（rich.ts の記号を書き足す・消す）。範囲は文字列の位置（入力Form の selectionStart・selectionEnd）
export interface Edited {
  text: string
  start: number // 付けたあとに選ぶ範囲
  end: number
}

// 付ける装飾: 太字、文字の色（本文に書く名前）、色を外す
export type Decoration = { bold: true } | { color: string } | { color: null }

const COLOR_BEFORE = /\{((?:@[a-z0-9-]+\/[a-z0-9-]+:)?[a-z][a-z0-9-]*):$/

export function decorate(text: string, start: number, end: number, d: Decoration): Edited {
  const before = text.slice(0, start)
  const inner = text.slice(start, end)
  const after = text.slice(end)
  if ("bold" in d) {
    // すでに ** で囲んでいれば外す
    if (before.endsWith("**") && after.startsWith("**"))
      return { text: before.slice(0, -2) + inner + after.slice(2), start: start - 2, end: end - 2 }
    return { text: `${before}**${inner}**${after}`, start: start + 2, end: end + 2 }
  }
  const wrapped = after.startsWith("}") ? COLOR_BEFORE.exec(before) : null
  if (wrapped) {
    // 色で囲んでいれば、外すか、同じ色なら外し、違う色なら替える
    const open = wrapped[0].length
    const outside = before.slice(0, -open)
    if (d.color === null || d.color === wrapped[1])
      return { text: outside + inner + after.slice(1), start: start - open, end: end - open }
    const tag = `{${d.color}:`
    return {
      text: outside + tag + inner + after,
      start: outside.length + tag.length,
      end: outside.length + tag.length + inner.length,
    }
  }
  if (d.color === null) return { text, start, end }
  const tag = `{${d.color}:`
  return { text: `${before}${tag}${inner}}${after}`, start: start + tag.length, end: end + tag.length }
}
