// 文中のチケットの番号（プロジェクトのプレフィクスに数字が続く形。例 M-0058・m-58）を見つける: 今あるプロジェクトのプレフィクスと今あるチケットの番号に合う物だけを、そのチケットの id を行き先にして返す。
// プレフィクスの大文字と小文字は分けず（prefixKey と同じ）、数字は 0 埋めがなくてもよい。語の途中（前後が英数字）の物と、今無い番号は見つけない
import type { WordFinder, WordMatch } from "../../base"
import { prefixKey } from "../project"

export interface RefProject {
  id: string
  prefix: string
}
export interface RefTicket {
  id: string
  project: string
  number: number
}

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// projects と tickets から、番号を見つける関数を作る（プロジェクトが無ければ、何も見つけない）
export function ticketRefFinder(projects: readonly RefProject[], tickets: readonly RefTicket[]): WordFinder {
  const byPrefix = new Map(projects.map(p => [prefixKey(p.prefix), p.id]))
  if (byPrefix.size === 0) return () => []
  const ids = new Map(tickets.map(t => [`${t.project}\n${t.number}`, t.id]))
  // 長いプレフィクスを先に（M と MM が両方あっても、長い方に合う）
  const prefixes = [...byPrefix.keys()].sort((a, b) => b.length - a.length).map(escaped)
  const pattern = new RegExp(`(?<![A-Za-z0-9])(${prefixes.join("|")})(\\d+)(?![A-Za-z0-9])`, "gi")
  return text => {
    const found: WordMatch[] = []
    for (const m of text.matchAll(pattern)) {
      const project = byPrefix.get(prefixKey(m[1] as string))
      const ticket = project === undefined ? undefined : ids.get(`${project}\n${Number(m[2])}`)
      if (ticket !== undefined) found.push({ at: m.index, length: m[0].length, target: ticket })
    }
    return found
  }
}
