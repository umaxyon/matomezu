// 書庫を整える（読めない物のフォルダへ移す・戻す、足りないシステムフォルダを足す、名前の重なりに番号を付ける）・読めない物のフォルダから完全に消す:
// 置き場所から読んだままの行を受けて、書く行の変わりを返す（同じ入力なら同じ結果。2 回行っても 1 回と同じ）。
// アクションでなく、常駐が起動したときと機能台帳が変わったときに行う。行の中身で変えるのは、どのフォルダの並びに入っているかと、番号を付けた名前だけ
// （番号はロック中の物にも付ける）

import { type UnreadableUnit, unreadableUnitsOf } from "./book"
import type { CoreCatalog } from "./core-catalog"
import {
  canHold,
  type EntryKind,
  type FreedTitle,
  type Naming,
  rowsWithin,
  withBackyards,
  withFreeTitles,
  withSystemFolders,
} from "./entries"
import {
  type AnyEntryRef,
  type BackyardRef,
  BROKEN,
  FIRST,
  type Folder,
  HOME_ID,
  isTopRole,
  type Library,
  libraryTopIdsIn,
  MOVED_CODES,
  type MovedCode,
  sameWorkKey,
  TOP_IDS,
  TRASH_ID,
  type TrashRef,
  UNREADABLE_ID,
  type UnreadableFolder,
  type UnreadableRef,
  unreadableFolderOf,
  type WorkKey,
} from "./folders"
import { pinnedCount, rowsLibraryOf } from "./folders-tree"
import { type Warning, warning } from "./warnings"

type Row = Readonly<Record<string, unknown>>

// 追加プラグインを無効にしたら、読めない物のフォルダへ移る物 1 つ（常駐が書かずに数えた物）: エントリの種類と id、在った所 holder（それを並びに持つフォルダの id）、訳の番号、無いタイプ（W027 のとき）
export interface MovedIfOff {
  id: string
  kind: EntryKind
  holder: string
  code: MovedCode
  type?: string
}
// 機能台帳が変わって、読めない物のフォルダへ移った物（訳ごとの数。訳は番号と、W027 なら無いタイプ）と、戻った物の数（窓が読み直したあとに利用者に知らせる。データには残さない）
export interface UnreadableNotice {
  moved: readonly { code: MovedCode; type?: string; count: number }[]
  returned: number
}

// 読めない物のフォルダの直下の物を完全に消すのを頼んだ答え: 消した・直下に無かった（ほかの窓が先に消したなど。何も書かない）
export const PURGED = "purged"
export const NOT_INSIDE = "not-inside"
export type Purged = typeof PURGED | typeof NOT_INSIDE

// 書く行の変わり: id → 新しい行（置き場所の行の形のまま）。消す行は removed に id を挙げる
export interface RowWrites {
  pages: Readonly<Record<string, unknown>>
  folders: Readonly<Record<string, unknown>>
  removedPages: readonly string[]
  removedFolders: readonly string[]
}

// 書庫を整えた結果: 書く行 writes と、移した物 moved（移した順）と、戻した物の id returned（戻した順）と、戻す先のバックヤードに同じ workKey の物が在って完全に消した物の id purged（消した順）と、
// 足したシステムフォルダ added（行の id と印。足した順）と、
// 名前に番号を付けた物 numbered（付けた順。どれも常駐のログに書く）
export interface Settled {
  writes: RowWrites
  moved: readonly UnreadableUnit[]
  returned: readonly string[]
  purged: readonly string[]
  added: readonly { id: string; systemFolder: string }[]
  numbered: readonly FreedTitle[]
}

// 書庫を整えるときの決まり: 名前を比べる言語 naming と、移した時刻 now と、足すシステムフォルダの行の id を振る newId
export interface SettleWith {
  naming: Naming
  now: string
  newId: () => string
}

// 置き場所から読んだままの行 pageRows・folderRows で、書庫を今の機能台帳に合わせて整える行の変わり: 今の機能台帳で読めない物は読めない物のフォルダへ移し、
// そこの物で読めるようになった物は在った所へ戻す。先に戻し（並びの順に、何も戻らなくなるまで繰り返す。入れ物が先に戻り、中の物は次の回で戻る）、それから移す。
// そのあと、足りないバックヤードとシステムフォルダを足し（withBackyards・withSystemFolders）、名前の重なりに番号を付ける（withFreeTitles。読んだデータの重なりも、戻った物・現れたシステムフォルダが当たった物も）。
// 決まりは with。読めない物のフォルダの行が形に合わなければ BROKEN、足すシステムフォルダの id が振れなければ BROKEN（何も書かない）
export function settleLibrary(
  catalog: CoreCatalog,
  pageRows: readonly unknown[],
  folderRows: readonly unknown[],
  { naming, now, newId }: SettleWith,
): Settled | typeof BROKEN {
  const found = unreadableFolderOf(folderRows)
  if (found === BROKEN) return BROKEN
  let world = worldOf(pageRows, folderRows, found)
  const returned: string[] = []
  const purged: string[] = []
  let units = unitsIn(catalog, world)
  for (let progressed = true; progressed; ) {
    progressed = false
    for (const ref of world.unreadable.lineup) {
      const back = returnedRows(catalog, world, ref, units)
      if (!back) continue
      world = back === TAKEN ? withPurged(world, ref) : withReturned(world, back)
      units = unitsIn(catalog, world)
      ;(back === TAKEN ? purged : returned).push(ref.entry.id)
      progressed = true
    }
  }
  const moved = units
  if (moved.length > 0) world = withMoved(world, moved, now)
  const library = libraryOf(world)
  const filled = withSystemFolders(withBackyards(library, catalog), catalog, newId)
  if (!filled) return BROKEN
  const { next, freed } = withFreeTitles(filled.next, naming)
  world = withLibrary(world, library, next)
  return { writes: writesOf(world), moved, returned, purged, added: filled.added, numbered: freed }
}

// 世界 world の書庫（rowsLibraryOf で読む。中の物が書庫に入る一番上のフォルダ（書庫ホーム・ゴミ箱）の下に在るフォルダの行だけで、読めない物のフォルダの中の物・どこにも入っていない物は入れない）
function libraryOf(world: World): Library {
  const holder = holdersIn(world)
  const tops = libraryTopIdsIn(world.folders)
  const rows = [...world.folders].flatMap(([id, row]) => {
    const top = tops.includes(id) ? id : topOf(world, holder, id)
    return top !== undefined && tops.includes(top) ? [row] : []
  })
  return rowsLibraryOf(rows, Object.fromEntries(world.pages))
}

// 世界 world に、その書庫 was（libraryOf）から変えた書庫 next を当てた世界（変えた行だけを、変えた行に入れる）
function withLibrary(world: World, was: Library, next: Library): World {
  const changed = (before: Readonly<Record<string, unknown>>, now: Readonly<Record<string, unknown>>) =>
    Object.keys(now).filter(id => before[id] !== now[id])
  const pages = changed(was.pages, next.pages)
  const folders = changed(was.folders, next.folders)
  if (pages.length === 0 && folders.length === 0) return world
  return {
    ...world,
    pages: new Map([...world.pages, ...pages.map(id => [id, next.pages[id]] as const)]),
    folders: new Map([...world.folders, ...folders.map(id => [id, next.folders[id]] as const)]),
    touchedPages: new Set([...world.touchedPages, ...pages]),
    touchedFolders: new Set([...world.touchedFolders, ...folders]),
  }
}

// 読めない物のフォルダの直下の物 id と、その中の物の行（完全に消す行）と、それを外した読めない物のフォルダの行。読めない物のフォルダの直下に無ければ undefined。
// ほかのフォルダ（読めないブックと id を分け合う物など）も持つ行は、消さない
export function purgedRows(
  pageRows: readonly unknown[],
  folderRows: readonly unknown[],
  id: string,
): RowWrites | undefined {
  const found = unreadableFolderOf(folderRows)
  if (found === BROKEN) return undefined
  const ref = found.lineup.find(r => r.entry.id === id)
  if (!ref) return undefined
  const library = rowsLibraryOf(
    folderRows.filter(f => (f as { id?: unknown } | null)?.id !== UNREADABLE_ID),
    Object.fromEntries(pageRows.flatMap(p => (isRow(p) && typeof p.id === "string" ? [[p.id, p]] : []))),
  )
  const under = ref.entry.kind === "page" ? { pages: [id], folders: [] } : rowsWithin(library.folders, id)
  const inside = new Set(under.folders)
  const elsewhere = new Set(
    Object.values(library.folders).flatMap(f => (inside.has(f.id) ? [] : f.lineup.map(r => r.id))),
  )
  const keep = (rows: readonly string[]) => rows.filter(r => !elsewhere.has(r))
  return {
    pages: {},
    folders: { [UNREADABLE_ID]: { ...found, lineup: found.lineup.filter(r => r !== ref) } },
    removedPages: keep(under.pages),
    removedFolders: keep(under.folders),
  }
}

const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v)

// 行を変えていく途中の世界: ページとフォルダの行（id → 行）と、読めない物のフォルダと、変えた行の id
interface World {
  pages: ReadonlyMap<string, unknown>
  folders: ReadonlyMap<string, unknown>
  unreadable: UnreadableFolder
  touchedPages: ReadonlySet<string>
  touchedFolders: ReadonlySet<string>
  removedPages: ReadonlySet<string>
  removedFolders: ReadonlySet<string>
}

// 置き場所から読んだままの行と読めない物のフォルダの、まだ何も変えていない世界
function worldOf(pageRows: readonly unknown[], folderRows: readonly unknown[], unreadable: UnreadableFolder): World {
  const byId = (rows: readonly unknown[]) =>
    new Map(rows.flatMap(r => (isRow(r) && typeof r.id === "string" ? [[r.id, r] as const] : [])))
  return {
    pages: byId(pageRows),
    folders: byId(folderRows),
    unreadable,
    touchedPages: new Set(),
    touchedFolders: new Set(),
    removedPages: new Set(),
    removedFolders: new Set(),
  }
}

// 世界 world の、今の機能台帳で読めない物
const unitsIn = (catalog: CoreCatalog, world: World): UnreadableUnit[] =>
  unreadableUnitsOf(
    catalog,
    [...world.pages.values()],
    [...new Map([...world.folders, [UNREADABLE_ID, world.unreadable]]).values()],
  )

// 世界 world に、1 つ戻したときに変わる行 back を当てた世界
function withReturned(world: World, back: Returned): World {
  return {
    ...world,
    pages: new Map([...world.pages, ...Object.entries(back.pages)]),
    folders: new Map([...world.folders, ...Object.entries(back.folders)]),
    unreadable: back.unreadable,
    touchedPages: new Set([...world.touchedPages, ...Object.keys(back.pages)]),
    touchedFolders: new Set([...world.touchedFolders, ...Object.keys(back.folders), UNREADABLE_ID]),
  }
}

// 世界 world の読めない物 units を、在った所の並びから外して、読めない物のフォルダの末尾に足した世界（直前の物は、外す前の並びで決める）
function withMoved(world: World, units: readonly UnreadableUnit[], now: string): World {
  const lineupOf = (id: string) => {
    const row = world.folders.get(id)
    return isRow(row) && Array.isArray(row.lineup) ? (row.lineup as readonly unknown[]) : []
  }
  const refs = units.map((u): UnreadableRef => {
    const before = lineupOf(u.holder)
    const at = before.findIndex(e => (e as { id?: unknown }).id === u.element.id)
    const prev = at > 0 ? (before[at - 1] as { id?: unknown }).id : undefined
    return {
      entry: u.element,
      from: [u.holder, ...aboveIn(world, u.holder)],
      after: typeof prev === "string" ? prev : FIRST,
      code: u.code,
      ...(u.type === undefined ? {} : { type: u.type }),
      moved: now,
    }
  })
  const gone = new Set(units.map(u => u.element.id))
  const holders = [...new Set(units.map(u => u.holder))]
  const folders = new Map(world.folders)
  for (const holder of holders)
    folders.set(holder, {
      ...(world.folders.get(holder) as Row),
      lineup: lineupOf(holder).filter(e => !gone.has((e as { id?: unknown }).id as string)),
    })
  return {
    ...world,
    folders,
    unreadable: { ...world.unreadable, lineup: [...world.unreadable.lineup, ...refs] },
    touchedFolders: new Set([...world.touchedFolders, ...holders, UNREADABLE_ID]),
  }
}

// 世界 world で、フォルダ id を入れているフォルダから上への id の列（近い順。書庫ホーム・ゴミ箱・読めない物のフォルダで止まる。輪になっていたら、そこで止める）
function aboveIn(world: World, id: string): string[] {
  const holder = holdersIn(world)
  const out: string[] = []
  for (let at = holder.get(id); at !== undefined && !out.includes(at); at = holder.get(at)) out.push(at)
  return out
}

// 世界 world の、エントリの id → それを並びに持つフォルダの id（読めない物のフォルダの中の物は、読めない物のフォルダ）
function holdersIn(world: World): Map<string, string> {
  const out = new Map<string, string>()
  for (const [id, row] of world.folders) {
    if (!isRow(row) || !Array.isArray(row.lineup)) continue
    for (const e of row.lineup as unknown[]) {
      const r = (e as { id?: unknown } | null)?.id
      if (typeof r === "string" && !out.has(r)) out.set(r, id)
    }
  }
  for (const r of world.unreadable.lineup) if (!out.has(r.entry.id)) out.set(r.entry.id, UNREADABLE_ID)
  return out
}

// 世界 world で変えた行の、書く行の変わり
function writesOf(world: World): RowWrites {
  const pick = (ids: ReadonlySet<string>, rows: ReadonlyMap<string, unknown>) =>
    Object.fromEntries([...ids].sort().map(id => [id, id === UNREADABLE_ID ? world.unreadable : rows.get(id)]))
  return {
    pages: pick(world.touchedPages, world.pages),
    folders: pick(world.touchedFolders, world.folders),
    removedPages: [...world.removedPages].sort(),
    removedFolders: [...world.removedFolders].sort(),
  }
}

// 1 つ戻したときに変わる行（戻す先のフォルダ）と、それを外した読めない物のフォルダ
interface Returned {
  pages: Readonly<Record<string, unknown>>
  folders: Readonly<Record<string, unknown>>
  unreadable: UnreadableFolder
}

// 読めない物のフォルダの物 ref を戻せるなら、戻したときに変わる行。戻す先は、在ったフォルダから上への列 from のうち、今も在って ref の種類を持てる最初のフォルダ
// （どれも無ければ書庫ホーム）で、戻したあとに読めない物 before のほかに読めない物が出ない所。入れ物がまだ読めない物のフォルダの中なら、その回は戻さない。
// 在ったフォルダに戻すときは、直前に並んでいた物の後ろへ（その物も読めない物のフォルダの中なら、その物の直前の物をたどる。見つからなければ末尾）。ほかの所へは末尾へ
// バックヤードに在った物（workKey を持つ物）は、在ったバックヤードにだけ戻す。そこに同じ workKey の物がもう在れば、戻せるときに戻さず TAKEN（完全に消す）
function returnedRows(
  catalog: CoreCatalog,
  world: World,
  ref: UnreadableRef,
  before: readonly UnreadableUnit[],
): Returned | typeof TAKEN | undefined {
  const { kind, id } = ref.entry
  const key = "workKey" in ref.entry ? ref.entry.workKey : undefined
  const holder = holdersIn(world)
  const unreadable = { ...world.unreadable, lineup: world.unreadable.lineup.filter(r => r !== ref) }
  const known = new Set(before.map(u => u.element.id))
  const places = key ? ref.from.slice(0, 1) : [...new Set([...ref.from, HOME_ID])]
  for (const to of places) {
    if (to === UNREADABLE_ID) continue
    const row = world.folders.get(to)
    if (!isRow(row) || !Array.isArray(row.lineup)) continue
    const top = topOf(world, holder, to)
    if (top === UNREADABLE_ID) return undefined
    if (top === undefined || !canHold(row as unknown as Folder, kind)) continue
    if (key && row.folderRole !== "backyard") continue
    const element = elementFor(ref, to)
    if (!element) continue
    const kept = row.lineup as readonly unknown[]
    const taken = (e: unknown) =>
      key !== undefined && isRow(e) && isRow(e.workKey) && sameWorkKey(e.workKey as unknown as WorkKey, key)
    const lineup = kept.filter(e => !taken(e))
    const at = to === ref.from[0] ? afterIndex(lineup, ref, world.unreadable) : lineup.length
    // 書庫ホームの先頭のシステムフォルダより前には入れない
    const pinned = to === HOME_ID ? pinnedCount(Object.fromEntries(world.folders) as Record<string, Folder>) : 0
    const index = Math.max(at, pinned)
    const folders: Record<string, unknown> = {
      [to]: { ...row, lineup: [...lineup.slice(0, index), element, ...lineup.slice(index)] },
    }
    const pages: Record<string, unknown> = {}
    // 戻した物も、戻す先とその上の入れ物も読めない物にならず、ほかに読めない物が増えない所にだけ戻す
    const after = unitsIn(catalog, withReturned(world, { pages, folders, unreadable }))
    const around = new Set([id, to, ...aboveIn(world, to)])
    if (after.every(u => known.has(u.element.id) && !around.has(u.element.id)))
      return lineup.length < kept.length ? TAKEN : { pages, folders, unreadable }
  }
  return undefined
}

// 戻す先に同じ workKey の物が在り、戻さずに完全に消す
const TAKEN = "taken"

// 世界 world から、読めない物のフォルダの物 ref とその中の物の行を完全に消した世界（purgedRows と同じ決まり）
function withPurged(world: World, ref: UnreadableRef): World {
  const writes = purgedRows([...world.pages.values()], [...world.folders.values(), world.unreadable], ref.entry.id)
  if (!writes) return world
  const pages = new Map(world.pages)
  const folders = new Map(world.folders)
  for (const id of writes.removedPages) pages.delete(id)
  for (const id of writes.removedFolders) folders.delete(id)
  return {
    ...world,
    pages,
    folders,
    unreadable: { ...world.unreadable, lineup: world.unreadable.lineup.filter(r => r !== ref) },
    touchedFolders: new Set([...world.touchedFolders, UNREADABLE_ID]),
    removedPages: new Set([...world.removedPages, ...writes.removedPages]),
    removedFolders: new Set([...world.removedFolders, ...writes.removedFolders]),
  }
}

// 世界 world のフォルダ id から上へたどって着く、一番上のフォルダの id（書庫ホーム・ゴミ箱・読めない物のフォルダ・バックヤード。どこにも着かなければ undefined）
function topOf(world: World, holder: ReadonlyMap<string, string>, id: string): string | undefined {
  const passed = new Set<string>()
  let at: string | undefined = id
  while (at !== undefined && !passed.has(at)) {
    if (TOP_IDS.includes(at) || isTopRole((world.folders.get(at) as { folderRole?: unknown } | undefined)?.folderRole))
      return at
    passed.add(at)
    at = holder.get(at)
  }
  return undefined
}

// 物 ref をフォルダ to に戻すときの並びのエントリ: ゴミ箱へは、ゴミ箱の並びのエントリ（ゴミ箱に居た物なら元のまま。ゴミ箱の中のフォルダに居た物なら、移した時刻を入れた時刻にし、
// ゴミ箱より手前の列を元の列にする）。ほかへは、id だけのエントリ
function elementFor(ref: UnreadableRef, to: string): AnyEntryRef | TrashRef | BackyardRef | undefined {
  const { kind, id } = ref.entry
  if ("workKey" in ref.entry) return { kind, id, workKey: ref.entry.workKey } as BackyardRef
  if (to !== TRASH_ID) return { kind, id } as AnyEntryRef
  if ("trashed" in ref.entry) return ref.entry
  const at = ref.from.indexOf(TRASH_ID)
  return { kind, id, trashed: ref.moved, from: at < 0 ? ref.from : ref.from.slice(0, at) } as TrashRef
}

// 在ったフォルダの並び lineup で、物 ref を入れる位置: 直前に並んでいた物の後ろ（その物が読めない物のフォルダ unreadable の中なら、その物の直前の物をたどる）。
// たどって先頭（FIRST）に着けば先頭、どこにも見つからなければ末尾
function afterIndex(lineup: readonly unknown[], ref: UnreadableRef, unreadable: UnreadableFolder): number {
  const passed = new Set<string>()
  let after = ref.after
  while (after !== FIRST) {
    if (passed.has(after)) return lineup.length
    passed.add(after)
    const at = lineup.findIndex(e => (e as { id?: unknown }).id === after)
    if (at >= 0) return at + 1
    const prev = unreadable.lineup.find(r => r.entry.id === after)
    if (!prev) return lineup.length
    after = prev.after
  }
  return 0
}

// 読めない物のフォルダ folder に物が在れば、その warning（W032。件数と、理由の番号ごとの件数を番号の順に）。無ければ undefined
export function unreadableWarning(folder: UnreadableFolder): Warning | undefined {
  if (folder.lineup.length === 0) return undefined
  const reasons = MOVED_CODES.flatMap(code => {
    const n = folder.lineup.filter(r => r.code === code).length
    return n === 0 ? [] : [`${code} x ${n}`]
  })
  return warning("W032", "", { count: `${folder.lineup.length}`, reasons: reasons.join(", ") })
}
