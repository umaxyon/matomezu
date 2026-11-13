// AI の一覧（read_records）の、種類の全部を読む道の 1 回分: 種類のレコードのうち、where（トップの項目 = 値）に合う物を、目次に載せる物と載せない物（対象の定義の aiListed）に分け、
// 引数 unlisted（hide は載せる物だけ・include は全部・only は載せない物だけ）の物を、並びの鍵（aiOrder。無ければ id）の順に 1 行ずつ（id と題 aiBrief）返す。
// hide のときは、載せなかった数（where に合う物のうち）も返す。形に合わないレコードは、載せる物として id だけの行で残す（数と続きが食い違わないように）。
// aiListed が指す先を読むのは、そのレコードの指す先（refers）だけ
import { briefLine } from "./brief"
import type { CoreCatalog } from "./core-catalog"
import type { SubjectDef } from "./def/subject"

export type UnlistedMode = "hide" | "include" | "only"
export const UNLISTED_MODES: readonly UnlistedMode[] = ["hide", "include", "only"]

export interface AIListRow {
  id: string
  brief: string
}

// 種類 def のレコード records（JSON）の一覧。byId は指す先のレコードを引く口（無ければ undefined）
export function listAIRecords(
  catalog: CoreCatalog,
  def: SubjectDef,
  records: readonly unknown[],
  where: Readonly<Record<string, string>>,
  mode: UnlistedMode,
  byId: (subject: string, id: string) => unknown | undefined,
): { rows: AIListRow[]; unlisted: number } {
  const wanted = Object.entries(where)
  // トップの項目が where の値と同じか（文字列はそのまま、ほかは JSON の書き方で比べる）
  const fits = (r: unknown) =>
    wanted.every(([k, v]) => {
      const x = (r as Record<string, unknown>)[k]
      return (typeof x === "string" ? x : JSON.stringify(x)) === v
    })
  const entries: { id: string; order: number; brief: string; listed: boolean }[] = []
  for (const r of records) {
    if (!fits(r)) continue
    const parsed = def.record.safeParse(r)
    if (!parsed.success) {
      entries.push({ id: String((r as { id?: unknown } | null)?.id ?? ""), order: 0, brief: "", listed: true })
      continue
    }
    const record = parsed.data as never
    const refs = def.refers?.(record) ?? []
    const read = (subject: string, id: string): unknown =>
      refs.some(x => x.subject === subject && x.id === id) ? (byId(subject, id) ?? "none") : "none"
    entries.push({
      id: (parsed.data as { id: string }).id,
      order: def.aiOrder?.(record) ?? 0,
      brief: briefLine(def.aiBrief?.(record, catalog) ?? "", 120),
      listed: def.aiListed?.when(record, { record: read }) !== false,
    })
  }
  const shown = entries.filter(e => (mode === "hide" ? e.listed : mode === "only" ? !e.listed : true))
  shown.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return {
    rows: shown.map(({ id, brief }) => ({ id, brief })),
    unlisted: mode === "hide" ? entries.filter(e => !e.listed).length : 0,
  }
}

// 種類 def のレコード 1 件（形に合うもの）が、一覧の既定の目次に載るか（aiListed を書かない種類は載る）。横断検索の当たりを、一覧と同じ aiListed で分けるのに使う
export function isAIListed(
  def: SubjectDef,
  record: unknown,
  byId: (subject: string, id: string) => unknown | undefined,
): boolean {
  const refs = def.refers?.(record as never) ?? []
  const read = (subject: string, id: string): unknown =>
    refs.some(x => x.subject === subject && x.id === id) ? (byId(subject, id) ?? "none") : "none"
  return def.aiListed?.when(record as never, { record: read }) !== false
}
