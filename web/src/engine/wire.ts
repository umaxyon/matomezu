// 常駐と JSON でやり取りするときの読み方と形: JSON の文字を読む・変わったページとフォルダの行の形

import { REMOVED } from "../core/records"

// JSON の文字 text を読んだ値（読めなければ undefined）
export function parseOr(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

// 変わったページ・フォルダ 1 つ（row は新しい値。無くなったなら removed が true で、row は無い）
export interface RowChange {
  id: string
  row?: unknown
  removed?: true
}
export const rowChanges = (changed: Readonly<Record<string, unknown>>): RowChange[] =>
  Object.entries(changed).map(([id, row]) => (row === REMOVED ? { id, removed: true as const } : { id, row }))
