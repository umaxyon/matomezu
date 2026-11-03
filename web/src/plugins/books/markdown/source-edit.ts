// ソースのペインで書いた原文を、ページの原文に送る形（page-update の fields）: 書く前の原文 base から書いた原文 draft への変わった所を、
// 送る先の原文 target の中でちょうど 1 か所になるまで前後の字を足した find と、その replace にする（ほかの変更と重なっても、変わった所だけを置き換える）。
// 字はサロゲートペアの途中で切らない。原文が空なら丸ごと（text）。広げても 1 か所にならなければ送れない（conflict）
import { onlyPlace } from "./page-fields"

export type SourceFields = { text: string } | { find: string; replace: string }
export type SourceEdit = { kind: "same" } | { kind: "send"; fields: SourceFields } | { kind: "conflict" }

// 変わった所: base の [start, end) が draft の [start, draftEnd) になった（前後の同じ字は除く）
type Changed = { start: number; end: number; draftEnd: number }

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff

// s の at が、サロゲートペアの 2 字目の前（ペアの途中）か
const splitsPair = (s: string, at: number) =>
  at > 0 && at < s.length && isLow(s.charCodeAt(at)) && isHigh(s.charCodeAt(at - 1))

function changedPart(base: string, draft: string): Changed | null {
  if (base === draft) return null
  const most = Math.min(base.length, draft.length)
  let head = 0
  while (head < most && base.charCodeAt(head) === draft.charCodeAt(head)) head++
  if (splitsPair(base, head) || splitsPair(draft, head)) head--
  let tail = 0
  while (tail < most - head && base.charCodeAt(base.length - 1 - tail) === draft.charCodeAt(draft.length - 1 - tail))
    tail++
  if (splitsPair(base, base.length - tail) || splitsPair(draft, draft.length - tail)) tail--
  return { start: head, end: base.length - tail, draftEnd: draft.length - tail }
}

// 1 字（サロゲートペアは 2 つで 1 字）前と後
const charBefore = (s: string, at: number) => (splitsPair(s, at - 1) ? at - 2 : at - 1)
const charAfter = (s: string, at: number) => (splitsPair(s, at + 1) ? at + 2 : at + 1)

export function sourceEdit(base: string, draft: string, target: string): SourceEdit {
  const changed = changedPart(base, draft)
  if (!changed) return { kind: "same" }
  if (base === "") return target === "" ? { kind: "send", fields: { text: draft } } : { kind: "conflict" }
  let { start, end } = changed
  // 前と後へ交互に 1 字ずつ広げる
  for (let left = true; ; left = !left) {
    const find = base.slice(start, end)
    if (find !== "" && onlyPlace(target, find) !== null)
      return { kind: "send", fields: { find, replace: draft.slice(start, draft.length - (base.length - end)) } }
    if (start === 0 && end === base.length) return { kind: "conflict" }
    if ((left && start > 0) || end === base.length) start = charBefore(base, start)
    else end = charAfter(base, end)
  }
}

// 原文が before から after に変わったときの、書く所（字の位置 at）の移り先: 変わった所より前はそのまま、後ろは長さの差だけずらし、中は変わった所の終わり
export function followCaret(before: string, after: string, at: number): number {
  const changed = changedPart(before, after)
  if (!changed) return at
  if (at <= changed.start) return at
  if (at >= changed.end) return at + after.length - before.length
  return changed.draftEnd
}
