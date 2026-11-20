// 置き場所から読んだままの行から、読めない物のフォルダとその中の物を外し（outsideUnreadable）、残りからブックの本文を組む（rawBooksOf）。
// 書庫を整える（読めない物のフォルダへ移す・戻す）のは core/unreadable.ts

import { BROKEN, isOpenRole, isUnreadableRole, type UnreadableRef, UnreadableRefSchema } from "./folders"
import { type Kept, sameParts } from "./folders-books"

// 行の並び rows の、id → 行（id を文字列で持つ物だけ）
export const rowsById = (rows: readonly unknown[]): Map<string, Readonly<Record<string, unknown>>> =>
  new Map(
    rows.flatMap(r =>
      typeof r === "object" && r !== null && typeof (r as { id?: unknown }).id === "string"
        ? [[(r as { id: string }).id, r as Readonly<Record<string, unknown>>] as const]
        : [],
    ),
  )

// 読めない物のフォルダの直下の物 1 つ: 並びの要素の entry の id、その物の行 row（置き場所から読んだまま。表に無ければ undefined）、
// 並びの要素 ref（形に合わなければ BROKEN。中の物は書庫から外れたまま、在った所は分からない）
export interface UnreadableItem {
  id: string
  row: unknown
  ref: UnreadableRef | typeof BROKEN
}
// 置き場所から読んだままの行を、書庫に入る物 pageRows・folderRows と、読めない物のフォルダの直下の物 unreadable（並びの順。外のフォルダも持つので書庫に残る物は除く）に分けた物
export interface OutsideUnreadable {
  pageRows: readonly unknown[]
  folderRows: readonly unknown[]
  unreadable: readonly UnreadableItem[]
}
const NO_UNREADABLE: readonly UnreadableItem[] = []

// 置き場所から読んだままの行のうち、読めない物のフォルダの行と、その中の物（何段下でも）の行を除いた物（書庫に入らない）と、そのとき外した直下の物（同じ行の並びには同じ値を返す）
const outsideKept = new WeakMap<readonly unknown[], { pages: readonly unknown[]; out: OutsideUnreadable }>()
export function outsideUnreadable(pageRows: readonly unknown[], folderRows: readonly unknown[]): OutsideUnreadable {
  const kept = outsideKept.get(folderRows)
  if (kept && kept.pages === pageRows) return kept.out
  const isUnreadable = (r: unknown) => isUnreadableRole((r as { folderRole?: unknown } | null)?.folderRole)
  const found = folderRows.find(isUnreadable) as { lineup?: unknown } | undefined
  const entries = Array.isArray(found?.lineup) ? (found.lineup as unknown[]) : []
  let out: OutsideUnreadable = { pageRows, folderRows, unreadable: NO_UNREADABLE }
  if (found) {
    const folder = rowsById(folderRows)
    const inside = new Set<string>()
    const walk = (id: string) => {
      if (inside.has(id)) return
      inside.add(id)
      const row = folder.get(id)
      for (const e of Array.isArray(row?.lineup) ? (row.lineup as unknown[]) : []) {
        const r = (e as { id?: unknown } | null)?.id
        if (typeof r === "string") walk(r)
      }
    }
    const pageOf = rowsById(pageRows)
    const unreadable: UnreadableItem[] = []
    for (const e of entries) {
      const id = (e as { entry?: { id?: unknown; kind?: unknown } } | null)?.entry?.id
      if (typeof id !== "string") continue
      walk(id)
      const parsed = UnreadableRefSchema.safeParse(e)
      const kind = (e as { entry: { kind?: unknown } }).entry.kind
      unreadable.push({
        id,
        row: kind === "page" ? pageOf.get(id) : folder.get(id),
        ref: parsed.success ? (parsed.data as UnreadableRef) : BROKEN,
      })
    }
    // 外に残るフォルダもその並びに持つ物（読めない物のフォルダへ移したブックと id を分け合う、読めるブックのページなど）は外さない（何段下でも）
    const lineupIdsOf = (row: Readonly<Record<string, unknown>>) =>
      (Array.isArray(row.lineup) ? (row.lineup as unknown[]) : []).flatMap(e => {
        const r = (e as { id?: unknown } | null)?.id
        return typeof r === "string" ? [r] : []
      })
    let held = [...folder.values()].filter(r => !isUnreadable(r) && !inside.has(r.id as string))
    while (held.length > 0) {
      const back = held.flatMap(lineupIdsOf).filter(id => inside.delete(id))
      held = back.flatMap(id => {
        const row = folder.get(id)
        return row ? [row] : []
      })
    }
    const away = (r: unknown) => inside.has((r as { id?: unknown } | null)?.id as string)
    out = {
      pageRows: pageRows.filter(r => !away(r)),
      folderRows: folderRows.filter(r => !isUnreadable(r) && !away(r)),
      unreadable: unreadable.filter(u => inside.has(u.id)),
    }
  }
  outsideKept.set(folderRows, { pages: pageRows, out })
  return out
}

// 置き場所から読んだままのページとフォルダ（形を確かめる前の値）から、ブックの本文（並びにページとバインダの中身ごと持つ形）を組む。確かめるのは、組んだ後（core/book.ts の checkBooks）。
// 読めない物のフォルダの中の物は組まない（outsideUnreadable。常駐も画面も、ここを通る）。ブックにするのは、役（folderRole）が書庫ホーム・ゴミ箱・フォルダ・バインダのどれでもないフォルダ（形の壊れた物も、そのまま 1 冊として返す。読めないブックとして見える）。
// エントリが id だけの物（kind と id だけを持つ）なら、表から引いて中身に替える（表に無ければ、そのまま残す）。それより多くを持つエントリは、中身ごと残っている物として、そのまま使う。
// 同じフォルダと同じ中身からは、同じ値を返す（確かめ直しを減らす）
const rawKept = new WeakMap<object, Kept<unknown>>()
export function rawBooksOf(allPages: readonly unknown[], allFolders: readonly unknown[]): unknown[] {
  const { pageRows: pages, folderRows: folders } = outsideUnreadable(allPages, allFolders)
  const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
    typeof v === "object" && v !== null && !Array.isArray(v)
  const byId = (rows: readonly unknown[]) =>
    new Map(rows.flatMap(r => (isObject(r) && typeof r.id === "string" ? [[r.id, r] as const] : [])))
  const page = byId(pages)
  const folder = byId(folders)
  // id だけのエントリ（その kind と id）
  const refOf = (e: unknown): { kind: string; id: string } | undefined =>
    isObject(e) && Object.keys(e).length === 2 && typeof e.kind === "string" && typeof e.id === "string"
      ? { kind: e.kind, id: e.id }
      : undefined
  const notBook = (f: Readonly<Record<string, unknown>>) =>
    isOpenRole(f.folderRole) || f.folderRole === "binder" || isUnreadableRole(f.folderRole)
  // フォルダ f を、エントリを中身に替えて組む（binder なら、並びのエントリの形にする）
  const made = (f: Readonly<Record<string, unknown>>, as: "book" | "binder"): unknown => {
    const lineup = Array.isArray(f.lineup) ? f.lineup : undefined
    const parts = (lineup ?? []).map((e: unknown) => {
      const r = refOf(e)
      if (r?.kind === "page") return page.get(r.id) ?? e
      const inner = r?.kind === "binder" ? folder.get(r.id) : undefined
      return inner ? made(inner, "binder") : e
    })
    const kept = rawKept.get(f)
    if (kept && sameParts(kept.parts, parts)) return kept.made
    const { folderRole: _, ...fields } = f
    const out = { ...(as === "binder" ? { kind: "binder" } : {}), ...fields, ...(lineup ? { lineup: parts } : {}) }
    rawKept.set(f, { parts, made: out })
    return out
  }
  return folders.flatMap(f => {
    if (!isObject(f)) return [f]
    return notBook(f) ? [] : [made(f, "book")]
  })
}
