// レコードの読み口: レコードが対象のアクションが読む物を、1 件ずつ・条件つきで引く所。画面は持っているレコードから、ホストのエンジンは置き場所から引く。
// 条件に合うかは core/record-keys.ts の関数で決める（読み口が返すのは候補で、ここで絞る。画面とホストで同じ結果になる）。
// アクションの読む物の宣言（ActionDef の reads が関数のとき）を引いた結果が、run に渡る ctx.records（中身）と ctx.keys（索引キーだけ）
import type { Actor } from "./actor"
import type { CoreCatalog } from "./core-catalog"
import type { ActionDef, AnyRecordRead } from "./def/action"
import { type Condition, type KeyValues, keyValuesOf, matches, unknownKey } from "./record-keys"
import { NO_RECORD, REMOVED, type Records } from "./records"

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
  const parsed = action.args.safeParse(args)
  const reads =
    parsed.success && action.reads
      ? (action.reads as (args: unknown, actor: Actor, on: string | undefined) => readonly AnyRecordRead[])(
          parsed.data,
          actor,
          on,
        )
      : []
  return readsFrom(catalog, source, reads, referred)
}

// 読む物の並び reads を、読み口から引いた結果（readFrom と、フォローステップの読む物が使う）。
// records は中身ごと読む物、keys は索引キーだけ読む物、record は読む物に書いた種類と referred を id で 1 件読む（どちらでもない物と、無いレコードは none）
export function readsFrom(
  catalog: CoreCatalog,
  source: RecordSource,
  reads: readonly AnyRecordRead[],
  referred: readonly { subject: string; id: string }[] = [],
): { records: Records; keys: RecordKeys; record(subject: string, id: string): unknown } {
  const records: Record<string, Record<string, unknown>> = {}
  const keys: Record<string, Record<string, KeyValues>> = {}
  const record = (subject: string, id: string): unknown =>
    subject in records || subject in keys || referred.some(r => r.subject === subject && r.id === id)
      ? (source.byId(subject, id) ?? NO_RECORD)
      : NO_RECORD
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

// 読み口 base に、書いたレコード written（種類 → id → レコードか REMOVED。REMOVED は消した）を重ねた読み口（アクションバルクの中のあとのアクションと、フォローステップが読む）
export function overlaid(
  catalog: CoreCatalog,
  base: RecordSource,
  written: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): RecordSource {
  if (Object.keys(written).length === 0) return base
  const mine = (subject: string) => written[subject] ?? {}
  const live = (subject: string) => Object.fromEntries(Object.entries(mine(subject)).filter(([, r]) => r !== REMOVED))
  const without = <T>(subject: string, rows: Readonly<Record<string, T>>) =>
    Object.fromEntries(Object.entries(rows).filter(([id]) => !(id in mine(subject))))
  return {
    byId: (subject, id) => {
      const r = mine(subject)[id]
      return r === undefined ? base.byId(subject, id) : r === REMOVED ? undefined : r
    },
    candidates: (subject, where) => ({ ...without(subject, base.candidates(subject, where)), ...live(subject) }),
    ...(base.keys
      ? {
          keys: (subject: string, where: Parameters<NonNullable<RecordSource["keys"]>>[1]) => {
            const def = catalog.subjects.get(subject)
            const own = Object.fromEntries(
              Object.entries(live(subject)).map(([id, r]) => [id, def ? keyValuesOf(def, r) : {}]),
            )
            return { ...without(subject, base.keys?.(subject, where) ?? {}), ...own }
          },
        }
      : {}),
  }
}
