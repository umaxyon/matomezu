// レコードを読む計算: ホストから引く読み口・変えたレコードに添える索引キーと横断検索の文字・AI に見せる一覧の行・種類の宣言。
// 台帳アセンブルの結果（Assembled）は、呼ぶたびに引数で受ける

import { isAIListed, listAIRecords, recordContext, UNLISTED_MODES } from "../core/ai-list"
import { briefLine } from "../core/brief"
import type { CoreCatalog } from "../core/core-catalog"
import { type SubjectDef, shownToAI } from "../core/def/subject"
import { type Condition, type KeyValues, keyValuesOf } from "../core/record-keys"
import type { RecordSource } from "../core/record-source"
import { REMOVED, type RecordChange, restoreRecords } from "../core/records"
import type { Assembled } from "../store/plugin"
import { parseOr } from "./wire"

// ホストが置いた、レコードを引く口（常駐が行う間だけ答える。無ければ、受けたレコードだけで行う）: 1 件（無ければ空の文字）と、種類の全部（id → レコードの JSON）
// 探す口は、条件 where（JSON）に合うかもしれないレコードを id → { record, keys } で答える（keysOnly なら record は無い。keys は置き場所が持っている索引キーの値）
const hostRecords = globalThis as {
  matomezuHostRecord?: (subject: string, id: string) => string
  matomezuHostFind?: (subject: string, where: string, keysOnly: boolean) => string
}

type HostFound = Readonly<Record<string, { record?: unknown; keys?: KeyValues }>>

// レコードの読み口: 受けたレコード given（宛先と、種類の並びで読む種類）に無い物は、ホストから引く
export function hostSource(given: Readonly<Record<string, Readonly<Record<string, unknown>>>>): RecordSource | null {
  const { matomezuHostRecord: one, matomezuHostFind: find } = hostRecords
  if (!one || !find) return null
  const found = (subject: string, where: readonly Condition[], keysOnly: boolean): HostFound =>
    (parseOr(find(subject, JSON.stringify(where), keysOnly)) ?? {}) as HostFound
  return {
    byId: (subject, id) => given[subject]?.[id] ?? parseOr(one(subject, id)),
    candidates: (subject, where) => ({
      ...Object.fromEntries(Object.entries(found(subject, where, false)).map(([id, row]) => [id, row.record])),
      ...given[subject],
    }),
    keys: (subject, where) =>
      Object.fromEntries(Object.entries(found(subject, where, true)).map(([id, row]) => [id, row.keys ?? {}])),
  }
}

// 変えたレコード 1 件に、索引キーの値を添える（置き場所が中身とは別に置く。消したレコードと、索引キーの無い種類には添えない）
export function withKeys(
  catalog: CoreCatalog,
  change: RecordChange,
): RecordChange & { keys?: KeyValues; search?: { title: string; body: string } } {
  const def = catalog.subjects.get(change.subject)
  if (def === undefined || change.record === REMOVED) return change
  const search = def.searchTexts ? searchTextOf(def, change.record) : undefined
  return {
    ...change,
    ...(def.keys ? { keys: keyValuesOf(def, change.record) } : {}),
    ...(search ? { search } : {}),
  }
}

// レコード 1 件の、横断検索に使う文字（形に合わない・関数が投げたレコードは undefined）
function searchTextOf(def: SubjectDef, record: unknown): { title: string; body: string } | undefined {
  const texts = def.searchTexts
  if (texts === undefined) return undefined
  return onRecord(def, record, data => {
    const { title, body } = texts(data)
    return { title: title ?? "", body: body ?? "" }
  })
}

// レコード 1 件を種類 def の形で確かめ、プラグインの関数 f に渡した答え。形に合わないか f が投げたら undefined（1 件の誤りで、ほかのレコードを止めない）
function onRecord<T>(def: SubjectDef, record: unknown, f: (data: never) => T): T | undefined {
  const parsed = def.record.safeParse(record)
  if (!parsed.success) return undefined
  try {
    return f(parsed.data as never)
  } catch {
    return undefined
  }
}

// engine.ts の matomezuAiRecords の中身
export function aiRecordsOf(of: Assembled, kind: string, records: string, where: string, unlisted: string): string {
  const def = of.catalog.core.subjects.get(kind)
  if (def === undefined || def.aiBrief === undefined) return "null"
  const source = hostSource({})
  const mode = UNLISTED_MODES.find(m => m === unlisted) ?? "hide"
  return JSON.stringify(
    listAIRecords(
      of.catalog.core,
      def,
      JSON.parse(records) as unknown[],
      JSON.parse(where) as Record<string, string>,
      mode,
      (subject, id) => source?.byId(subject, id),
    ),
  )
}

// engine.ts の matomezuUnlistedOf の中身
export function unlistedOf(of: Assembled, subject: string, records: string): string {
  const def = of.catalog.core.subjects.get(subject)
  const source = hostSource({})
  const out: string[] = []
  if (def) {
    for (const [id, record] of Object.entries(parseOr(records) as Record<string, unknown>)) {
      const listed = onRecord(def, record, data => isAIListed(of.catalog.core, def, data, (s, i) => source?.byId(s, i)))
      if (listed === false) out.push(id)
    }
  }
  return JSON.stringify(out)
}

// engine.ts の matomezuKinds の中身
export function kindsOf(of: Assembled): string {
  return JSON.stringify(
    [...of.catalog.core.subjects.values()].map(s => ({
      subject: s.id,
      keys: Object.entries(s.keys ?? {}).map(([name, key]) => ({ name, type: key.type })),
      // AI に見せる種類か（aiBrief を書いた種類）と、その一覧の既定の並びと件数（aiList。索引キーで探す種類だけ）
      search: s.searchTexts !== undefined,
      ai: shownToAI(s),
      ...(shownToAI(s) && s.aiList && s.keys?.[s.aiList.order.key] ? { aiList: s.aiList } : {}),
      // 目次に載せない物がある種類の、載せない物の説明（aiListed。read_records の unlisted を受ける種類）
      ...(shownToAI(s) && s.aiListed ? { aiUnlisted: s.aiListed.unlisted } : {}),
    })),
  )
}

// engine.ts の matomezuAiRows の中身
export function aiRowsOf(of: Assembled, kind: string, records: string): string {
  const catalog = of.catalog.core
  const source = hostSource({})
  const def = catalog.subjects.get(kind)
  const brief = def?.aiBrief
  if (def === undefined || brief === undefined) return "null"
  return JSON.stringify(
    (JSON.parse(records) as unknown[]).map(
      r =>
        onRecord(def, r, (data: { id: string }) => {
          const line = briefLine(
            brief(
              data,
              recordContext(catalog, def, data, (s, i) => source?.byId(s, i)),
            ),
            120,
          )
          return { id: data.id, ...(def.aiRow?.(data) ?? {}), ...(line === "" ? {} : { brief: line }) }
        }) ?? { id: String((r as { id?: unknown } | null)?.id ?? "") },
    ),
  )
}

// engine.ts の matomezuKeysOf の中身
export function keysOf(of: Assembled, subject: string, records: string): string {
  const def = of.catalog.core.subjects.get(subject)
  const table = restoreRecords({ [subject]: parseOr(records) })[subject] ?? {}
  return JSON.stringify(
    Object.fromEntries(Object.entries(table).map(([id, record]) => [id, def ? keyValuesOf(def, record) : {}])),
  )
}

// engine.ts の matomezuSearchTextsOf の中身
export function searchTextsOf(of: Assembled, subject: string, records: string): string {
  const def = of.catalog.core.subjects.get(subject)
  const out: Record<string, { title: string; body: string }> = {}
  if (def?.searchTexts) {
    for (const [id, record] of Object.entries(parseOr(records) as Record<string, unknown>)) {
      const text = searchTextOf(def, record)
      if (text) out[id] = text
    }
  }
  return JSON.stringify(out)
}

// engine.ts の matomezuParentsOf の中身
export function parentsOf(of: Assembled, subject: string, records: string): string {
  const def = of.catalog.core.subjects.get(subject)
  const out: Record<string, { subject: string; id: string }> = {}
  if (def?.refers) {
    for (const [id, record] of Object.entries(parseOr(records) as Record<string, unknown>)) {
      const refers = def.refers
      const first = onRecord(def, record, data => refers(data)[0])
      if (first) out[id] = { subject: first.subject, id: first.id }
    }
  }
  return JSON.stringify(out)
}

// engine.ts の matomezuSubjectRoles の中身
export function subjectRolesOf(of: Assembled): string {
  return JSON.stringify(
    Object.fromEntries([...of.catalog.core.subjects.values()].flatMap(s => (s.role ? [[s.role, s.id]] : []))),
  )
}

// engine.ts の matomezuRecordNeeds の中身
export function recordNeedsOf(of: Assembled, action: string, args: string): string {
  const def = of.catalog.core.actions.get(action)
  const subject = def && of.catalog.core.subjects.has(def.target) ? def.target : null
  const books = (() => {
    if (subject === null || !def?.readsBooks) return []
    const parsed = def.args.safeParse(parseOr(args))
    return parsed.success ? [...(def.readsBooks as (args: unknown) => readonly string[])(parsed.data)] : []
  })()
  return JSON.stringify({
    subject,
    books,
  })
}
