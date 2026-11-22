// 世界（World）から対象を選んでアクションを行い、変わった物だけの形にする。行う前の問い（permittedIn）も同じ対象の選び方で

import { type Annotation, type Annotations, type PageAnnotations, prune } from "./annotation"
import { pagesOf } from "./book"
import type { CoreCatalog } from "./core-catalog"
import type { ActionContext, ActionDef, ActionOn, ActionTarget, AIEditTicketChange, AIMessage } from "./def/action"
import { shownToAI } from "./def/subject"
import { type Naming, namingOf, titleClashes, withFreeTitles } from "./entries"
import type { Library, PageRow, TableChanges } from "./folders"
import { bookOf } from "./folders-books"
import { changesBetween, createdIn, noChanges, placedChanges, rowChanges, withChanges } from "./folders-changes"
import { bookIdOf, inTrash, permissionFoldersOf, treeHolds } from "./folders-tree"
import { followChanges } from "./follow"
import type { Books } from "./library"
import {
  languageTitleTaken,
  type NoPage,
  noPage,
  type PageAt,
  type PageOutsideBook,
  perform,
  type Refused,
  titleTaken,
} from "./perform"
import { isRecordTarget } from "./perform-checks"
import { NOT_IN_BOOK, type PermitContext, type Permitted, permitted } from "./perform-permit"
import { FOLDERS, type WithFolders } from "./permission-input"
import type { ItemPage } from "./placed"
import { type RecordSource, readerOf, readFrom, SOURCE, sourceIn, sourceOf, type WithSource } from "./record-source"
import { type Counters, NO_RECORD, REMOVED, type RecordChange, type Records } from "./records"
import { sameData } from "./same"
import type { Book } from "./schema/book"
import { langChosen, type Settings } from "./settings"

// アクションが変えるもの全部: ページの表とフォルダの表（ゴミ箱のブックの分も。ブックは、ここから組む。core/folders.ts）と、利用者の設定と、ページごとのアノテーションと、対象の定義が足した種類のレコードと番号の表
export interface World extends Library {
  settings: Settings
  annotations: Annotations
  records: Records // 対象の定義が足した種類ごとのレコード（種類の id → id → レコード）
  counters: Counters // 番号を振る種類ごとの、区切りごとの次の番号
  // レコードの読み口（無ければ records から引く。ホストのエンジンは、records に宛先だけを持ち、ほかは置き場所から引く読み口を渡す）
  source?: RecordSource
}

// performIn の結果。変わったものだけを持つ（changes は変わった・足した・無くなったページとフォルダ。ブック・ページ・書庫が対象のアクションで、何も変わらなければ無い。
// annotations はアノテーションが変わったページの id → 新しい並び。アノテーションが対象のアクションのほか、ページの物が消えたときと、ページが無くなったときと、ブックが一覧から無くなったときにも変わる）
export type PerformedIn =
  | {
      ok: true
      result: unknown
      changes?: TableChanges
      settings?: Settings
      annotations?: Annotations
      records?: readonly RecordChange[] // レコードが対象のアクションで変わったレコード（宛先の 1 件が先で、ほかは run が返した順。1 つのトランザクションで当てる）
      counters?: Counters // レコードが対象のアクションが進めた番号（種類の id → 区切り → 次の番号。進めた区切りだけ）
      aiEditTickets?: readonly AIEditTicketChange[] // レコードが対象のアクションが返した、AI 編集チケットの変え方の並び（レコードと同じ 1 回の書き込みで当てる）
      aiMessages?: readonly AIMessage[] // レコードが対象のアクションが返した、送る AI 間メッセージの並び（常駐がバルクの書き込みと一緒に送る）
      // records のうち、フォローステップが応じて変えたレコード（core/follow.ts。常駐は、行う者に関わらず、これが編集ロックに当たれば断る）
      followed?: readonly { subject: string; id: string }[]
    }
  | Refused
  | { ok: false; reason: "no-book" }
  | { ok: false; reason: "no-record"; detail: string }

// ページかアノテーションが対象のアクションの宛先（on のページ）と、そのページを持っているブック（どのブックにも入っていなければ、そのページと、認可ステップに見せるフォルダの列）。
// performIn と permittedIn で同じ決まりを使う。ゴミ箱の中のページ（ゴミ箱のブックのページも）は、無いものとする
function targetPageIn(world: World, on: ActionOn | undefined): PageAt | NoPage {
  const page = (on && "page" in on ? on.page : undefined) ?? ""
  const row = world.pages[page]
  if (!row || inTrash(world.folders, page)) return noPage(page)
  const id = bookIdOf(world.folders, page)
  const book = id === undefined ? undefined : bookOf(world, id)
  if (id !== undefined && !book) return noPage(page)
  return book
    ? { book, page }
    : { book: NOT_IN_BOOK, page, held: row, folders: permissionFoldersOf(world.folders, page) }
}

// on.record に指した id のレコードが無いときの断り: どの種類のどの id が無いか。AI に見える種類なら、直し方（一覧の引き方）と種類の説明（id が何の id か）も
function noRecord(
  catalog: CoreCatalog,
  target: string,
  wanted: string,
): { ok: false; reason: "no-record"; detail: string } {
  const def = catalog.subjects.get(target)
  // AI に見せる種類（aiBrief を書いた種類）だけ、一覧の引き方と種類の説明を言う
  const shown = def !== undefined && shownToAI(def)
  const list = shown ? `; read_records with kind ${target} lists the records` : ""
  const about = shown ? ` About that subject: ${def.aiDescription}` : ""
  return {
    ok: false,
    reason: "no-record",
    detail: `there is no ${target} record with the id ${wanted} (on.record is the id of a record of the action's subject${list}).${about}`,
  }
}

// 対象を world から選んでアクションを行う（画面の store・常駐・行い直しで同じ決まりを使う）。
// ブックが対象なら on のブックで（ゴミ箱のブックは無いものとして断る）、ページとアノテーションが対象なら on のページを持っているブックで（ブックの外のページなら、そのページで）行い、ブックの id を変えたら断る。同じ値の設定は変わらなかったとみなす。
// ブックが変わったら、無くなった物をそのページのアノテーションのアンカーから外し（core/annotation.ts の prune）、無くなったページと、一覧から無くなったブックのページと、ゴミ箱に入ったページのアノテーションは消す
export function performIn(
  world: World,
  id: string,
  args: unknown,
  on: ActionOn | undefined,
  given: Omit<ActionContext, "naming">,
): PerformedIn {
  // 名前を引く決まりは、どの対象のアクションにも、世界の利用者の設定から入れる
  const naming = namingOf(given.catalog, world.settings)
  const ctx: ActionContext = { ...given, naming, ...inputsOf(world) }
  const target: ActionTarget | undefined = ctx.catalog.actions.get(id)?.target
  const loose = perform as (
    subject: unknown,
    id: string,
    args: unknown,
    ctx: ActionContext,
  ) => ReturnType<typeof perform>
  if (target !== undefined && isRecordTarget(ctx.catalog, target))
    return performRecord(world, target, id, args, on, ctx)
  if (target === "book") {
    const book = bookIn(world, on as { book: string } | undefined)
    if (!book) return { ok: false, reason: "no-book" }
    return changedBook(ctx.naming, world, book, loose(book, id, args, ctx))
  }
  if (target === "annotations") {
    const at = targetPageIn(world, on)
    if ("ok" in at) return at
    const annotations = world.annotations[at.page] ?? []
    const done = loose({ ...at, annotations }, id, args, ctx)
    if (!done.ok) return done
    const next = (done.next as PageAnnotations).annotations
    return next === annotations
      ? { ok: true, result: done.result }
      : { ok: true, result: done.result, annotations: { [at.page]: next } }
  }
  if (target === "page") {
    const at = targetPageIn(world, on)
    if ("ok" in at) return at
    return at.book === NOT_IN_BOOK
      ? changedPage(ctx.naming, world, at, loose(at, id, args, ctx))
      : changedBook(ctx.naming, world, at.book, loose(at, id, args, ctx))
  }
  if (target === "library") {
    const library: Library = { pages: world.pages, folders: world.folders }
    const subjects = ctx.catalog.actions.get(id)?.readsSubjects?.(ctx.catalog)
    const read = subjects ? readerOf(ctx.catalog, sourceIn(ctx), subjects) : undefined
    const done = loose(library, id, args, read ? { ...ctx, record: read.record, find: read.find } : ctx)
    if (!done.ok) return done
    const made = rowChanges(library, done.next as Library)
    // 足したブックと無くなったブックの置き場所を書く。木の決まりを守っていた世界は、行った後も守る
    const changes = placedChanges(world, made)
    const after = withChanges(world, changes)
    if (!treeHolds(after)) return { ok: false, reason: "refused" }
    const clashes = titleClashes(after, naming)
    if (clashes.length > 0) return titleTaken(after, clashes, naming)
    // 無くなったページと、ゴミ箱に入ったページ（ゴミ箱に入った物の中のページも）のアノテーションは消す
    const gone = Object.keys(world.annotations).filter(
      p =>
        (world.annotations[p]?.length ?? 0) > 0 &&
        (changes.pages[p] === REMOVED || (inTrash(after.folders, p) && !inTrash(world.folders, p))),
    )
    return {
      ok: true,
      result: done.result,
      ...(noChanges(changes) ? {} : { changes }),
      ...(gone.length === 0 ? {} : { annotations: Object.fromEntries(gone.map(p => [p, []])) }),
    }
  }
  const done = loose(world.settings, id, args, ctx)
  if (!done.ok) return done
  const next = done.next as Settings
  const same = sameData(next, world.settings)
  if (same) return { ok: true, result: done.result }
  // 選んでいた言語を変えて、名前を設定の言語で引く物（システムフォルダ）の名前が、同じフォルダのほかの物と重なるなら断る（書庫の行は変えない）。
  // 言語を選んでいない所から初めて選ぶのは、変えるのでないので断らず、当たる物に、常駐が書庫を整えるときと同じ withFreeTitles で番号を付けて、同じバルクで書く
  const library: Library = { pages: world.pages, folders: world.folders }
  const nextNaming = namingOf(ctx.catalog, next)
  if (nextNaming.lang === naming.lang) return { ok: true, result: done.result, settings: next }
  if (langChosen(ctx.catalog, world.settings)) {
    const clashes = titleClashes(library, nextNaming)
    if (clashes.length > 0) return languageTitleTaken(library, clashes, nextNaming)
    return { ok: true, result: done.result, settings: next }
  }
  const freed = withFreeTitles(library, nextNaming).next
  const changes = rowChanges(library, freed)
  return { ok: true, result: done.result, settings: next, ...(noChanges(changes) ? {} : { changes }) }
}

// 変わり changes が新しく足すページ・フォルダの id が、世界 world にもう在るか（行う前のブック before に無かった物を足すなら、その id は世界のどこにも無いこと。
// ページもフォルダも、ちょうど 1 つのフォルダに入り、id は世界の中で重ならない）
const collides = (world: Library, before: readonly Book[], changes: TableChanges): boolean =>
  createdIn(before, changes).some(id => id in world.pages || id in world.folders)

// ブックを変えるアクションの結果 done を、変わった物だけの形にする（book は行う前のブック）。
// ブックの id を変えていたら断り、変わったページでは無くなった物をアノテーションのアンカーから外し、無くなったページのアノテーションは消す（名前は naming で引く）
function changedBook(naming: Naming, world: World, book: Book, done: ReturnType<typeof perform>): PerformedIn {
  if (!done.ok) return done
  const next = done.next as Book
  if (next.id !== book.id) return { ok: false, reason: "refused" }
  if (next === book) return { ok: true, result: done.result }
  const changes = changesBetween([book], [next])
  if (collides(world, [book], changes)) return { ok: false, reason: "refused" }
  if (next.title !== book.title) {
    const after = withChanges(world, changes)
    const clashes = titleClashes(after, naming)
    if (clashes.length > 0) return titleTaken(after, clashes, naming)
  }
  const { annotations } = world
  const now = new Map(pagesOf(next).map(p => [p.id, p]))
  const changed: Record<string, readonly Annotation[]> = {}
  for (const was of pagesOf(book)) {
    const list = annotations[was.id]
    if (!list || list.length === 0) continue
    const page = now.get(was.id)
    const kept = !page ? [] : page === was ? list : prune(list, page)
    if (kept !== list) changed[was.id] = kept
  }
  return {
    ok: true,
    result: done.result,
    ...(noChanges(changes) ? {} : { changes }),
    ...(Object.keys(changed).length === 0 ? {} : { annotations: changed }),
  }
}

// ブックの外のページを変えるアクションの結果 done を、変わった物だけの形にする（at は行う前の宛先）。
// 入っているバインダの中の紙と向きがそろわなくなるなら断り、名前を変えて同じフォルダの中の名前と重なるなら名前が重なる断りにする（名前は naming で引く）。
// 無くなった物は、そのページのアノテーションのアンカーから外す
function changedPage(naming: Naming, world: World, at: PageOutsideBook, done: ReturnType<typeof perform>): PerformedIn {
  if (!done.ok) return done
  const next = done.next as ItemPage
  if (next === at.held) return { ok: true, result: done.result }
  const changes: TableChanges = { pages: { [next.id]: next as PageRow }, folders: {} }
  const binder = at.folders[0]?.folderRole === "binder" ? at.folders[0] : undefined
  const mates = (binder?.lineup ?? []).flatMap(r => {
    const row = r.id === next.id ? next : world.pages[r.id]
    return row?.kind === "page" ? [row] : []
  })
  if (mates.some(p => p.paper !== next.paper || p.orientation !== next.orientation))
    return { ok: false, reason: "refused" }
  if (next.title !== at.held.title) {
    const after = withChanges(world, changes)
    const clashes = titleClashes(after, naming)
    if (clashes.length > 0) return titleTaken(after, clashes, naming)
  }
  const list = world.annotations[next.id]
  const kept = list && list.length > 0 ? prune(list, next) : list
  return {
    ok: true,
    result: done.result,
    changes,
    ...(kept !== list && kept ? { annotations: { [next.id]: kept } } : {}),
  }
}

// レコードが対象のアクションを行う: on の record のレコード（無ければ新しく作る）を渡し、宛先と、run が返したほかの同じ種類のレコードを変えた結果を返す。
// 作るレコードの id は今ある id と重ならない。readsBooks を書いたアクションには、引数が答えた id のブックだけを ctx.books に渡す
function performRecord(
  world: World,
  target: string,
  id: string,
  args: unknown,
  on: ActionOn | undefined,
  ctx: ActionContext,
): PerformedIn {
  const source = world.source ?? sourceOf(world.records)
  const def = ctx.catalog.subjects.get(target)
  const action = ctx.catalog.actions.get(id)
  const used: Record<string, number> = {}
  const counters = world.counters[target] ?? {}
  const wanted = on && "record" in on ? on.record : undefined
  const now = wanted === undefined ? NO_RECORD : source.byId(target, wanted)
  if (now === undefined) return noRecord(ctx.catalog, target, wanted as string)
  const referred = now === NO_RECORD ? [] : (def?.refers?.(now as never) ?? [])
  const read = action
    ? readFrom(ctx.catalog, source, action, args, ctx.actor, wanted, referred)
    : { records: {}, keys: {}, record: () => NO_RECORD }
  const withBase: ActionContext & WithSource = {
    ...ctx,
    [SOURCE]: source,
    records: read.records,
    keys: read.keys,
    record: read.record,
    ...(action?.readsBooks ? { books: booksRead(world, action, args) } : {}),
    ...(def?.numbered
      ? {
          number: (scope: string) => {
            const n = used[scope] ?? counters[scope] ?? 1
            used[scope] = n + 1
            return n
          },
        }
      : {}),
  }
  const done = (perform as (s: unknown, id: string, a: unknown, c: ActionContext) => ReturnType<typeof perform>)(
    now,
    id,
    args,
    withBase,
  )
  if (!done.ok) return done
  const next = done.next as unknown
  const changes: RecordChange[] = []
  if (next === REMOVED) changes.push({ subject: target, id: wanted as string, record: REMOVED })
  else if (next !== now) {
    const made = (next as { id: string }).id
    if (now === NO_RECORD && source.byId(target, made) !== undefined)
      return {
        ok: false,
        reason: "refused",
        detail: `the ${target} record ${made} is already there: change it with on.record set to ${made}; leaving on out makes a new record`,
      }
    changes.push({ subject: target, id: made, record: next })
  }
  for (const o of done.others ?? []) {
    const kind: string = o.subject ?? target
    const had = source.byId(kind, o.id)
    if (o.record === REMOVED ? had === undefined : o.record === had) continue
    changes.push({ subject: kind, id: o.id, record: o.record })
  }
  const followed = action
    ? followChanges(ctx, action, source, changes)
    : { ok: true as const, records: changes, followed: [] }
  if (!followed.ok) return followed
  const records = followed.records
  return {
    ok: true,
    result: done.result,
    ...(records.length > 0 ? { records } : {}),
    ...(followed.followed.length > 0 ? { followed: followed.followed } : {}),
    ...(records.length > 0 && Object.keys(used).length > 0 ? { counters: { [target]: used } } : {}),
    ...(done.aiEditTickets ? { aiEditTickets: done.aiEditTickets } : {}),
    ...(done.aiMessages ? { aiMessages: done.aiMessages } : {}),
  }
}

// アクション action が引数 args から答えた、読むだけのブック（world にあるブックだけ。引数が形に合わなければ無し）
function booksRead(world: World, action: ActionDef, args: unknown): Books {
  const parsed = action.args.safeParse(args)
  if (!parsed.success || !action.readsBooks) return {}
  const ids = (action.readsBooks as (args: unknown) => readonly string[])(parsed.data)
  return Object.fromEntries(
    ids.flatMap(id => {
      const book = bookOf(world, id)
      return book ? [[id, book]] : []
    }),
  )
}

// ブックが対象のアクションの宛先のブック（on のブック。無いか、ゴミ箱のブックなら null）。performIn と permittedIn で同じ決まりを使う
// 認可ステップが読む、世界 world のレコードの読み口と書庫のフォルダ（アクションの文脈に、core の中だけで引く鍵で持たせる）
const inputsOf = (world: World): WithSource & WithFolders => ({
  [SOURCE]: world.source ?? sourceOf(world.records),
  [FOLDERS]: world.folders,
})

function bookIn(world: World, on: ActionOn | undefined): Book | null {
  const book = bookOf(world, (on && "book" in on ? on.book : undefined) ?? "")
  return book && !inTrash(world.folders, book.id) ? book : null
}

// world でアクション id を引数 args で行えるかを、行う前に問う（対象の選び方は performIn と同じ。run は回さない）
export function permittedIn(
  world: World,
  id: string,
  args: unknown,
  on: ActionOn | undefined,
  given: PermitContext,
): Permitted | Refused | { ok: false; reason: "no-book" } | ReturnType<typeof noRecord> {
  const ctx: PermitContext = { ...given, ...inputsOf(world) }
  const target: ActionTarget | undefined = ctx.catalog.actions.get(id)?.target
  if (target === "book") {
    const book = bookIn(world, on)
    return book ? permitted(book, id, args, ctx) : { ok: false, reason: "no-book" }
  }
  if (target === "page" || target === "annotations") {
    const at = targetPageIn(world, on)
    if ("ok" in at) return at
    return permitted(target === "page" ? at : { ...at, annotations: world.annotations[at.page] ?? [] }, id, args, ctx)
  }
  if (target !== undefined && isRecordTarget(ctx.catalog, target)) {
    const wanted = on && "record" in on ? on.record : undefined
    const source = world.source ?? sourceOf(world.records)
    const now = wanted === undefined ? NO_RECORD : source.byId(target, wanted)
    return now === undefined
      ? noRecord(ctx.catalog, target, wanted as string)
      : permitted(now, id, args, { ...ctx, [SOURCE]: source, records: {} })
  }
  return permitted(
    target === "library" ? { pages: world.pages, folders: world.folders } : world.settings,
    id,
    args,
    ctx,
  )
}
