// AI の一覧（read_records）の、種類の全部を読む道の 1 回分: 種類のレコードのうち、where（索引キー = 値。索引キーでない名前は、呼ぶ側が断る）に合う物を、目次に載せる物と載せない物（対象の定義の aiListed）に分け、
// 引数 unlisted（hide は載せる物だけ・include は全部・only は載せない物だけ）の物を、並びの鍵（aiOrder。無ければ id）の順に 1 行ずつ（id と題 aiBrief）返す。
// hide のときは、載せなかった数（where に合う物のうち）も返す。形に合わないレコードは、載せる物として id だけの行で残す（数と続きが食い違わないように）。
// aiBrief と aiListed が指す先を読むのは、そのレコードの指す先（refers）だけ
import { briefLine } from "./brief"
import type { CoreCatalog } from "./core-catalog"
import type { AIRecordContext, SubjectDef } from "./def/subject"
import { keyValuesOf } from "./record-keys"

export type UnlistedMode = "hide" | "include" | "only"
export const UNLISTED_MODES: readonly UnlistedMode[] = ["hide", "include", "only"]

export interface AIListRow {
  id: string
  brief: string
}

// 種類 def のレコード record が aiBrief・aiListed に渡す口（指す先 refers だけ byId で引く。無ければ none）
export function recordContext(
  catalog: CoreCatalog,
  def: SubjectDef,
  record: unknown,
  byId: (subject: string, id: string) => unknown | undefined,
): AIRecordContext {
  const refs = def.refers?.(record as never) ?? []
  return {
    catalog,
    record: (subject, id) =>
      refs.some(x => x.subject === subject && x.id === id) ? (byId(subject, id) ?? "none") : "none",
  }
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
  // 索引キーの値が where の値と同じか（値はどちらも字にして比べる。値の無いキーは合わない）
  const fits = (record: unknown) => {
    const values = keyValuesOf(def, record)
    return wanted.every(([k, v]) => values[k] !== undefined && String(values[k]) === v)
  }
  const entries: { id: string; order: number; brief: string; listed: boolean }[] = []
  for (const r of records) {
    const parsed = def.record.safeParse(r)
    if (!parsed.success) {
      // 形に合わないレコードは索引キーの値を持たないので、条件があれば合わない
      if (wanted.length === 0)
        entries.push({ id: String((r as { id?: unknown } | null)?.id ?? ""), order: 0, brief: "", listed: true })
      continue
    }
    if (!fits(parsed.data)) continue
    const record = parsed.data as never
    const ctx = recordContext(catalog, def, record, byId)
    entries.push({
      id: (parsed.data as { id: string }).id,
      order: def.aiOrder?.(record) ?? 0,
      brief: briefLine(def.aiBrief?.(record, ctx) ?? "", 120),
      listed: def.aiListed?.when(record, ctx) !== false,
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
  catalog: CoreCatalog,
  def: SubjectDef,
  record: unknown,
  byId: (subject: string, id: string) => unknown | undefined,
): boolean {
  return def.aiListed?.when(record as never, recordContext(catalog, def, record, byId)) !== false
}
