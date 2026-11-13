// レコードの読み口: レコードが対象のアクションが読む物を、1 件ずつ・条件つきで引く所。画面は持っているレコードから、ホストのエンジンは置き場所から引く。
// 条件に合うかは core/record-keys.ts の関数で決める（読み口が返すのは候補で、ここで絞る。画面とホストで同じ結果になる）。
// アクションの読む物の宣言（ActionDef の reads が関数のとき）を引いた結果が、run に渡る ctx.records（中身）と ctx.keys（索引キーだけ）
import type { Actor } from "./actor"
import type { CoreCatalog } from "./core-catalog"
import type { ActionDef, AnyRecordRead } from "./def/action"
import { type Condition, type KeyValues, keyValuesOf, matches, unknownKey } from "./record-keys"
import { NO_RECORD, type Records } from "./records"

export interface RecordSource {
  // 種類 subject の id のレコード（無ければ undefined）
  byId(subject: string, id: string): unknown | undefined
  // 種類 subject の、条件 where に合うかもしれないレコードの全部（id → レコード。合わない物が混ざってよい）
  candidates(subject: string, where: readonly Condition[]): Readonly<Record<string, unknown>>
  // 同じく、合うかもしれないレコードの索引キーの値だけ（id → 値の組。中身を開けずに答えられる読み口だけが持つ。無ければ candidates の中身から求める）
  keys?(subject: string, where: readonly Condition[]): Readonly<Record<string, KeyValues>>
}

// 持っているレコード records から引く読み口
export function sourceOf(records: Records): RecordSource {
  return {
    byId: (subject, id) => records[subject]?.[id],
    candidates: subject => records[subject] ?? {},
  }
}

// アクションの文脈に読み口を持たせる鍵（run を書くプラグインには見せない。core の中だけで引く）
export const SOURCE: unique symbol = Symbol("record source")
export type WithSource = { [SOURCE]?: RecordSource }
export const sourceIn = (ctx: object): RecordSource | undefined => (ctx as WithSource)[SOURCE]

// アクションが読む索引キーだけの行（種類の id → id → 索引キーの値）
export type RecordKeys = Readonly<Record<string, Readonly<Record<string, KeyValues>>>>

// 種類 subject の、条件 where に合うレコード（id → レコードと索引キーの値）。宣言に無いキーの条件なら、何も合わない。
// keysOnly なら中身は読まず（record は undefined）、読み口が索引キーの値だけを答えられれば、それを使う
export function find(
  catalog: CoreCatalog,
  source: RecordSource,
  subject: string,
  where: readonly Condition[],
  keysOnly = false,
): Readonly<Record<string, { record: unknown; keys: KeyValues }>> {
  const def = catalog.subjects.get(subject)
  if (!def || unknownKey(def, where) !== null) return {}
  const out: Record<string, { record: unknown; keys: KeyValues }> = {}
  if (keysOnly && source.keys) {
    for (const [id, keys] of Object.entries(source.keys(subject, where)))
      if (matches(keys, where)) out[id] = { record: undefined, keys }
    return out
  }
  for (const [id, record] of Object.entries(source.candidates(subject, where))) {
    const keys = keyValuesOf(def, record)
    if (matches(keys, where)) out[id] = { record, keys }
  }
  return out
}

// アクション action の読む物の宣言が、引数 args・行う者 actor・宛先のレコードの id（on。作るときは undefined）から答えた物を、読み口から引いた結果。
// records は中身ごと読む物（種類の id → id → レコード）、keys は索引キーだけ読む物。引数が形に合わなければ、どちらも空。
// referred は、宛先のレコードが指す先（対象の定義の refers）。record で、読む物に書いていない種類でも読める
export function readFrom(
  catalog: CoreCatalog,
  source: RecordSource,
  action: ActionDef,
  args: unknown,
  actor: Actor,
  on?: string,
  referred: readonly { subject: string; id: string }[] = [],
): { records: Records; keys: RecordKeys; record(subject: string, id: string): unknown } {
  const records: Record<string, Record<string, unknown>> = {}
  const keys: Record<string, Record<string, KeyValues>> = {}
  // 読む物に書いた種類のレコードと、宛先のレコードが指す先を、id で 1 件読む（どちらでもない物と、無いレコードは none）
  const record = (subject: string, id: string): unknown =>
    subject in records || subject in keys || referred.some(r => r.subject === subject && r.id === id)
      ? (source.byId(subject, id) ?? NO_RECORD)
      : NO_RECORD
  const parsed = action.args.safeParse(args)
  if (!parsed.success || !action.reads) return { records, keys, record }
  const reads = (action.reads as (args: unknown, actor: Actor, on: string | undefined) => readonly AnyRecordRead[])(
    parsed.data,
    actor,
    on,
  )
  // 種類 subject の入れ物（まだ無ければ作る。合う物が 1 件も無くても、読んだ種類は空の入れ物を持つ）
  const tableIn = <V>(all: Record<string, Record<string, V>>, subject: string): Record<string, V> => {
    const table = all[subject] ?? {}
    all[subject] = table
    return table
  }
  for (const read of reads) {
    if ("id" in read) {
      const record = source.byId(read.subject, read.id)
      const table = tableIn(records, read.subject)
      if (record !== undefined) table[read.id] = record
      continue
    }
    const found = find(catalog, source, read.subject, read.where, read.keysOnly === true)
    if (read.keysOnly) {
      const table = tableIn(keys, read.subject)
      for (const [id, row] of Object.entries(found)) table[id] = row.keys
    } else {
      const table = tableIn(records, read.subject)
      for (const [id, row] of Object.entries(found)) table[id] = row.record
    }
  }
  return { records, keys, record }
}
