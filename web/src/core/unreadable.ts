// 書庫を整える（読めない物のフォルダへ移す・戻す）・そこから完全に消す: 置き場所から読んだままの行を受けて、書く行の変わりを返す（同じ入力なら同じ結果。2 回行っても 1 回と同じ）。
// アクションでなく、常駐が起動したときと機能台帳が変わったときに行う。行の中身には手を付けず、変えるのは、どのフォルダの並びに入っているかだけ
// （戻すときに名前が重なれば、名前に番号を付ける。ロック中の物にも付ける）

import { type UnreadableUnit, unreadableUnitsOf } from "./book"
import type { CoreCatalog } from "./core-catalog"
import { canHold, type EntryKind, freeTitleIn, type Naming, rowsWithin, titleOf } from "./entries"
import {
  type AnyEntryRef,
  BROKEN,
  FIRST,
  type Folder,
  HOME_ID,
  MOVED_CODES,
  pinnedCount,
  rowsLibraryOf,
  TRASH_ID,
  type TrashRef,
  UNREADABLE_ID,
  type UnreadableFolder,
  type UnreadableRef,
  unreadableFolderOf,
} from "./folders"
import { type Warning, warning } from "./warnings"

type Row = Readonly<Record<string, unknown>>

// 書く行の変わり: id → 新しい行（置き場所の行の形のまま）。消す行は removed に id を挙げる
export interface RowWrites {
  pages: Readonly<Record<string, unknown>>
  folders: Readonly<Record<string, unknown>>
  removedPages: readonly string[]
  removedFolders: readonly string[]
}

// 書庫を整えた結果: 書く行 writes と、移した物 moved（移した順）と、戻した物の id returned（戻した順）と、名前に番号を付けた物 numbered（付けた順。どれも常駐のログに書く）
export interface Settled {
  writes: RowWrites
  moved: readonly UnreadableUnit[]
  returned: readonly string[]
  numbered: readonly { id: string; title: string }[]
}

// 書庫を整えるときの決まり: 名前を比べる言語 naming と、移した時刻 now と、新しい行の id を振る newId（行を足す物のため）
export interface SettleWith {
  naming: Naming
  now: string
  newId: () => string
}

// 置き場所から読んだままの行 pageRows・folderRows で、書庫を今の機能台帳に合わせて整える行の変わり: 今の機能台帳で読めない物は読めない物のフォルダへ移し、
// そこの物で読めるようになった物は在った所へ戻す。先に戻し（並びの順に、何も戻らなくなるまで繰り返す。入れ物が先に戻り、中の物は次の回で戻る）、それから移す
// （決まりは with）。読めない物のフォルダの行が形に合わなければ BROKEN（何も書かない）
export function settleLibrary(
  catalog: CoreCatalog,
  pageRows: readonly unknown[],
  folderRows: readonly unknown[],
  { naming, now }: SettleWith,
): Settled | typeof BROKEN {
  const found = unreadableFolderOf(folderRows)
  if (found === BROKEN) return BROKEN
  const world = new World(pageRows, folderRows, found)
  const returned: string[] = []
  const numbered: { id: string; title: string }[] = []
  let units = world.units(catalog)
  for (let progressed = true; progressed; ) {
    progressed = false
    for (const ref of world.unreadable.lineup) {
      const back = returnedRows(catalog, world, ref, units, naming)
      if (!back) continue
      world.apply(back)
      units = world.units(catalog)
      returned.push(ref.entry.id)
      if (back.title !== undefined) numbered.push({ id: ref.entry.id, title: back.title })
      progressed = true
    }
  }
  const moved = units
  if (moved.length > 0) world.move(moved, now)
  return { writes: world.writes(), moved, returned, numbered }
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
class World {
  pages: Map<string, unknown>
  folders: Map<string, unknown>
  unreadable: UnreadableFolder
  private readonly touchedPages = new Set<string>()
  private readonly touchedFolders = new Set<string>()

  constructor(pageRows: readonly unknown[], folderRows: readonly unknown[], unreadable: UnreadableFolder) {
    const byId = (rows: readonly unknown[]) =>
      new Map(rows.flatMap(r => (isRow(r) && typeof r.id === "string" ? [[r.id, r] as const] : [])))
    this.pages = byId(pageRows)
    this.folders = byId(folderRows)
    this.unreadable = unreadable
  }

  units(catalog: CoreCatalog): UnreadableUnit[] {
    return unreadableUnitsOf(catalog, [...this.pages.values()], [...this.withUnreadable().values()])
  }

  // フォルダの行に、今の読めない物のフォルダを入れた物
  withUnreadable(): Map<string, unknown> {
    return new Map([...this.folders, [UNREADABLE_ID, this.unreadable]])
  }

  apply(back: Returned) {
    for (const [id, row] of Object.entries(back.folders)) {
      this.folders.set(id, row)
      this.touchedFolders.add(id)
    }
    for (const [id, row] of Object.entries(back.pages)) {
      this.pages.set(id, row)
      this.touchedPages.add(id)
    }
    this.unreadable = back.unreadable
    this.touchedFolders.add(UNREADABLE_ID)
  }

  // 読めない物 units を、在った所の並びから外して、読めない物のフォルダの末尾に足す（直前の物は、外す前の並びで決める）
  move(units: readonly UnreadableUnit[], now: string) {
    const original = new Map<string, readonly unknown[]>()
    const lineupOf = (id: string) => {
      const row = this.folders.get(id)
      return isRow(row) && Array.isArray(row.lineup) ? (row.lineup as readonly unknown[]) : []
    }
    const refs: UnreadableRef[] = []
    for (const u of units) {
      if (!original.has(u.holder)) original.set(u.holder, lineupOf(u.holder))
      const before = original.get(u.holder) ?? []
      const at = before.findIndex(e => (e as { id?: unknown }).id === u.element.id)
      const prev = at > 0 ? (before[at - 1] as { id?: unknown }).id : undefined
      refs.push({
        entry: u.element,
        from: [u.holder, ...this.above(u.holder)],
        after: typeof prev === "string" ? prev : FIRST,
        code: u.code,
        ...(u.type === undefined ? {} : { type: u.type }),
        moved: now,
      })
    }
    const gone = new Set(units.map(u => u.element.id))
    for (const holder of original.keys()) {
      const row = this.folders.get(holder) as Row
      this.folders.set(holder, {
        ...row,
        lineup: lineupOf(holder).filter(e => !gone.has((e as { id?: unknown }).id as string)),
      })
      this.touchedFolders.add(holder)
    }
    this.unreadable = { ...this.unreadable, lineup: [...this.unreadable.lineup, ...refs] }
    this.touchedFolders.add(UNREADABLE_ID)
  }

  // フォルダ id を入れているフォルダから上への id の列（近い順。書庫ホーム・ゴミ箱・読めない物のフォルダで止まる。輪になっていたら、そこで止める）
  above(id: string): string[] {
    const holder = this.holders()
    const out: string[] = []
    for (let at = holder.get(id); at !== undefined && !out.includes(at); at = holder.get(at)) out.push(at)
    return out
  }

  // エントリの id → それを並びに持つフォルダの id（読めない物のフォルダの中の物は、読めない物のフォルダ）
  holders(): Map<string, string> {
    const out = new Map<string, string>()
    for (const [id, row] of this.folders) {
      if (!isRow(row) || !Array.isArray(row.lineup)) continue
      for (const e of row.lineup as unknown[]) {
        const r = (e as { id?: unknown } | null)?.id
        if (typeof r === "string" && !out.has(r)) out.set(r, id)
      }
    }
    for (const r of this.unreadable.lineup) if (!out.has(r.entry.id)) out.set(r.entry.id, UNREADABLE_ID)
    return out
  }

  writes(): RowWrites {
    const pick = (ids: Set<string>, rows: Map<string, unknown>) =>
      Object.fromEntries([...ids].sort().map(id => [id, id === UNREADABLE_ID ? this.unreadable : rows.get(id)]))
    return {
      pages: pick(this.touchedPages, this.pages),
      folders: pick(this.touchedFolders, this.folders),
      removedPages: [],
      removedFolders: [],
    }
  }
}

// 1 つ戻したときに変わる行（戻す先のフォルダ・名前に番号を付けた行）と、それを外した読めない物のフォルダ
interface Returned {
  pages: Readonly<Record<string, unknown>>
  folders: Readonly<Record<string, unknown>>
  unreadable: UnreadableFolder
  title?: string // 名前に番号を付けたなら、付けた名前
}

// 読めない物のフォルダの物 ref を戻せるなら、戻したときに変わる行。戻す先は、在ったフォルダから上への列 from のうち、今も在って ref の種類を持てる最初のフォルダ
// （どれも無ければ書庫ホーム）で、戻したあとに読めない物 before のほかに読めない物が出ない所。入れ物がまだ読めない物のフォルダの中なら、その回は戻さない。
// 在ったフォルダに戻すときは、直前に並んでいた物の後ろへ（その物も読めない物のフォルダの中なら、その物の直前の物をたどる。見つからなければ末尾）。ほかの所へは末尾へ
function returnedRows(
  catalog: CoreCatalog,
  world: World,
  ref: UnreadableRef,
  before: readonly UnreadableUnit[],
  naming: Naming,
): Returned | undefined {
  const { kind, id } = ref.entry
  const holder = world.holders()
  const unreadable = { ...world.unreadable, lineup: world.unreadable.lineup.filter(r => r !== ref) }
  const known = new Set(before.map(u => u.element.id))
  for (const to of [...new Set([...ref.from, HOME_ID])]) {
    if (to === UNREADABLE_ID) continue
    const row = world.folders.get(to)
    if (!isRow(row) || !Array.isArray(row.lineup)) continue
    const top = topOf(holder, to)
    if (top === UNREADABLE_ID) return undefined
    if (top === undefined || !canHold(row as unknown as Folder, kind)) continue
    const element = elementFor(ref, to)
    if (!element) continue
    const lineup = row.lineup as readonly unknown[]
    const at = to === ref.from[0] ? afterIndex(lineup, ref, world.unreadable) : lineup.length
    // 書庫ホームの先頭のシステムフォルダより前には入れない
    const pinned = to === HOME_ID ? pinnedCount(Object.fromEntries(world.folders) as Record<string, Folder>) : 0
    const index = Math.max(at, pinned)
    const folders: Record<string, unknown> = {
      [to]: { ...row, lineup: [...lineup.slice(0, index), element, ...lineup.slice(index)] },
    }
    const pages: Record<string, unknown> = {}
    const titled = to === TRASH_ID ? undefined : renamed(world, kind, id, to, folders, naming)
    if (titled) (kind === "page" ? pages : folders)[id] = titled
    const trial = new World([], [], unreadable)
    trial.pages = new Map([...world.pages, ...Object.entries(pages)])
    trial.folders = new Map([...world.folders, ...Object.entries(folders)])
    // 戻した物も、戻す先とその上の入れ物も読めない物にならず、ほかに読めない物が増えない所にだけ戻す
    const after = trial.units(catalog)
    const around = new Set([id, to, ...world.above(to)])
    if (after.every(u => known.has(u.element.id) && !around.has(u.element.id)))
      return { pages, folders, unreadable, ...(titled ? { title: titled.title as string } : {}) }
  }
  return undefined
}

// フォルダ id から上へたどって着く、一番上のフォルダの id（書庫ホーム・ゴミ箱・読めない物のフォルダ。どこにも着かなければ undefined）
function topOf(holder: ReadonlyMap<string, string>, id: string): string | undefined {
  const passed = new Set<string>()
  let at: string | undefined = id
  while (at !== undefined && !passed.has(at)) {
    if (at === HOME_ID || at === TRASH_ID || at === UNREADABLE_ID) return at
    passed.add(at)
    at = holder.get(at)
  }
  return undefined
}

// 物 ref をフォルダ to に戻すときの並びのエントリ: ゴミ箱へは、ゴミ箱の並びのエントリ（ゴミ箱に居た物なら元のまま。ゴミ箱の中のフォルダに居た物なら、移した時刻を入れた時刻にし、
// ゴミ箱より手前の列を元の列にする）。ほかへは、id だけのエントリ
function elementFor(ref: UnreadableRef, to: string): AnyEntryRef | TrashRef | undefined {
  const { kind, id } = ref.entry
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

// 物 id（種類 kind）を、フォルダ to（変えた行 folders を当てた物）に入れたとき、ほかの物と名前が重なるなら、番号を付けた名前にした行（重ならなければ undefined。
// 番号の付け方は、書庫が対象のアクションと同じ freeTitleIn）
function renamed(
  world: World,
  kind: EntryKind,
  id: string,
  to: string,
  folders: Readonly<Record<string, unknown>>,
  naming: Naming,
): Row | undefined {
  const library = rowsLibraryOf(
    [...new Map([...world.folders, ...Object.entries(folders)]).values()],
    Object.fromEntries(world.pages),
  )
  const free = freeTitleIn(library, kind, id, to, naming)
  if (free === undefined || free === titleOf(library, kind, id, naming)) return undefined
  const row = (kind === "page" ? world.pages.get(id) : world.folders.get(id)) as Row
  return { ...row, title: free }
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
