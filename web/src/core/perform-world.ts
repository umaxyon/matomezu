// 世界（World）から対象を選んでアクションを行い、変わった物だけの形にする。行う前の問い（permittedIn）も同じ対象の選び方で

import { type Annotation, type Annotations, type PageAnnotations, prune } from "./annotation"
import { pagesOf } from "./book"
import type { CoreCatalog } from "./core-catalog"
import {
  type ActionContext,
  type ActionDef,
  type ActionOn,
  type ActionTarget,
  type AIEditTicketChange,
  type OtherRecord,
  type Payload,
  type RefreshRequest,
  takesBook,
} from "./def/action"
import type { HostMessage } from "./def/follow-step"
import { shownToAI } from "./def/subject"
import { type Naming, namingOf, titleClashes, withFreeTitles } from "./entries"
import { isHeld, type Library, type PageRow, type TableChanges } from "./folders"
import { bookOf, unheldIn } from "./folders-books"
import { changesBetween, createdIn, noChanges, placedChanges, rowChanges, withChanges } from "./folders-changes"
import { bookIdOf, inTrash, outsideBinderIn, permissionFoldersOf, treeHolds } from "./folders-tree"
import { followChanges } from "./follow"
import { followedInBackyard } from "./follow-backyard"
import type { Books } from "./library"
import {
  type BinderOutsideBook,
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
import { brokenIn } from "./perform-library"
import { NOT_IN_BOOK, type PermitContext, type Permitted, permitted } from "./perform-permit"
import { FOLDERS, type WithFolders } from "./permission-input"
import type { ItemPage } from "./placed"
import { type RecordSource, readerOf, readFrom, SOURCE, sourceIn, sourceOf, type WithSource } from "./record-source"
import { type Counters, NO_RECORD, REMOVED, type RecordChange, type Records } from "./records"
import { deadReferences, newReferencesHold, unreadTargets } from "./references"
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
      records?: readonly RecordChange[] // レコードか書庫が対象のアクションで変わったレコード（レコードが対象なら宛先の 1 件が先で、ほかは run が返した順。1 つのトランザクションで当てる）
      counters?: Counters // レコードが対象のアクションが進めた番号（種類の id → 区切り → 次の番号。進めた区切りだけ）
      aiEditTickets?: readonly AIEditTicketChange[] // レコードが対象のアクションが返した、AI 編集チケットの変え方の並び（レコードと同じ 1 回の書き込みで当てる）
      payloads?: readonly Payload[] // レコードが対象のアクションが返した、送る matomezu ペイロードの並び（常駐がバルクの書き込みと一緒に送る）
      refreshRequest?: RefreshRequest // 書庫かレコードが対象のアクションが返したリフレッシュリクエスト（常駐が、バルクが通ったら行った参加者に覚える）
      // records のうち、フォローステップが応じて変えたレコード（core/follow.ts。常駐は、行う者に関わらず、これが編集ロックに当たれば断る）
      followed?: readonly { subject: string; id: string }[]
      // フォローステップがバックヤードの中で消したページ・フォルダと、名前を変えたブックと、アノテーションを消したページ（常駐は、行う者に関わらず、これが編集ロックに当たれば断る）
      followedRows?: readonly string[]
      hostMessages?: readonly HostMessage[] // フォローステップが返した、送る常駐メッセージの並び（常駐がバルクの書き込みと一緒に送る）
    }
  | Refused
  // 要る行が世界に無いか、中身を持っていない（常駐は、その行を足して行い直す）。books は、フォローステップがバックヤードの中に行う事の先のブックか、
  // ブックが新しく置いた参照エントリの指す先か、中身を持っていないページの id
  | { ok: false; reason: "needs-rows"; books: readonly string[] }
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

// アクション id（対象 target）が読む物のうち、世界 world が中身を持っていないページの id（持っていれば空）。
// 書庫が対象なら書庫の全部、ブックが対象なら宛先のブックかバインダ、ページとアノテーションが対象なら宛先のページを持っているブック（ブックの外なら、そのページ）、
// レコードが対象なら引数から答えた読むだけのブック
function unheldFor(
  catalog: CoreCatalog,
  world: World,
  target: ActionTarget | undefined,
  id: string,
  args: unknown,
  on: ActionOn | undefined,
): readonly string[] {
  if (target === "library") return Object.values(world.pages).flatMap(p => (isHeld(p) ? [] : [p.id]))
  if (target === "book") return unheldIn(world, (on && "book" in on ? on.book : undefined) ?? "")
  if (target === "page" || target === "annotations") {
    const page = (on && "page" in on ? on.page : undefined) ?? ""
    return unheldIn(world, bookIdOf(world.folders, page) ?? page)
  }
  if (target === undefined || !isRecordTarget(catalog, target)) return []
  const action = catalog.actions.get(id)
  const parsed = action?.readsBooks ? action.args.safeParse(args) : undefined
  if (!action?.readsBooks || !parsed?.success) return []
  return (action.readsBooks as (args: unknown) => readonly string[])(parsed.data).flatMap(b => unheldIn(world, b))
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
// ブックが対象なら on のブックか、ブックの外のバインダで（ゴミ箱の中の物は無いものとして断る。ブックにだけ行えるアクションは、バインダを断る）、ページとアノテーションが対象なら on のページを持っているブックで（ブックの外のページなら、そのページで）行い、ブックの id を変えたら断る。同じ値の設定は変わらなかったとみなす。
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
  const unheld = unheldFor(ctx.catalog, world, target, id, args, on)
  if (unheld.length > 0) return { ok: false, reason: "needs-rows", books: unheld }
  if (target !== undefined && isRecordTarget(ctx.catalog, target))
    return performRecord(world, target, id, args, on, ctx)
  if (target === "book") {
    const at = targetLineupIn(ctx.catalog, world, id, on)
    if (!at) return { ok: false, reason: "no-book" }
    return "binder" in at
      ? changedLibrary(naming, world, loose(at, id, args, ctx))
      : changedBook(ctx.naming, world, at, loose(at, id, args, ctx))
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
    const changed = changedLibrary(naming, world, done)
    if (!changed.ok || !done.ok) return changed
    return withOthersFollowed(world, ctx, id, changed, done.others ?? [])
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

// 書庫を変えるアクション（書庫が対象か、ブックの外のバインダに行った、ブックが対象のアクション）の結果 done を、変わった物だけの形にする。
// 足したブックと無くなったブックの置き場所を書き、木の決まりと名前の重なりを確かめ、無くなったページと、ゴミ箱に入ったページ（ゴミ箱に入った物の中のページも）のアノテーションは消し、
// 変わったページでは、無くなった物をアノテーションのアンカーから外す（名前は naming で引く）
function changedLibrary(naming: Naming, world: World, done: ReturnType<typeof perform>): PerformedIn {
  if (!done.ok) return done
  const library: Library = { pages: world.pages, folders: world.folders }
  const made = rowChanges(library, done.next as Library)
  // 木の決まりを守っていた世界は、行った後も守る
  const changes = placedChanges(world, made)
  const after = withChanges(world, changes)
  if (!treeHolds(after)) return { ok: false, reason: "refused" }
  const clashes = titleClashes(after, naming)
  if (clashes.length > 0) return titleTaken(after, clashes, naming)
  const changed: Record<string, readonly Annotation[]> = {}
  for (const [p, list] of Object.entries(world.annotations)) {
    if (list.length === 0) continue
    const page = changes.pages[p]
    if (page === REMOVED || (inTrash(after.folders, p) && !inTrash(world.folders, p))) changed[p] = []
    else if (page !== undefined) {
      const kept = prune(list, page)
      if (kept !== list) changed[p] = kept
    }
  }
  return {
    ok: true,
    result: done.result,
    ...(noChanges(changes) ? {} : { changes }),
    ...(Object.keys(changed).length === 0 ? {} : { annotations: changed }),
    ...(done.refreshRequest ? { refreshRequest: done.refreshRequest } : {}),
  }
}

// 変わり changes が新しく足すページ・フォルダの id が、世界 world にもう在るか（行う前のブック before に無かった物を足すなら、その id は世界のどこにも無いこと。
// ページもフォルダも、ちょうど 1 つのフォルダに入り、id は世界の中で重ならない）
const collides = (world: Library, before: readonly Book[], changes: TableChanges): boolean =>
  createdIn(before, changes).some(id => id in world.pages || id in world.folders)

// ブックを変えるアクションの結果 done を、変わった物だけの形にする（book は行う前のブック。残れなくなったほかのブックの参照エントリも外す）。
// ブックの id を変えていたら断り、変わったページでは無くなった物をアノテーションのアンカーから外し、無くなったページのアノテーションは消す（名前は naming で引く）
function changedBook(naming: Naming, world: World, book: Book, done: ReturnType<typeof perform>): PerformedIn {
  if (!done.ok) return done
  const next = done.next as Book
  if (next.id !== book.id) return { ok: false, reason: "refused" }
  if (next === book) return { ok: true, result: done.result }
  const own = changesBetween([book], [next])
  if (collides(world, [book], own)) return { ok: false, reason: "refused" }
  const after = withChanges(world, own)
  const unread = unreadTargets(after, book, next)
  if (unread.length > 0) return { ok: false, reason: "needs-rows", books: unread }
  if (!newReferencesHold(after, book, next)) return { ok: false, reason: "refused" }
  // ページやバインダを消して・入れ替えて、ほかのブックの参照エントリが残れなくなったら、同じ書き込みで外す
  // （残れなくなるのはフォルダの並びが変わったときだけなので、ページの中身だけの変わりでは確かめない）
  const dead = Object.keys(own.folders).length === 0 ? {} : deadReferences(after)
  const changes = Object.keys(dead).length === 0 ? own : { ...own, folders: { ...own.folders, ...dead } }
  if (next.title !== book.title) {
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
    ...(done.refreshRequest ? { refreshRequest: done.refreshRequest } : {}),
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

// レコードが対象のアクションを行う: on の record のレコード（無ければ新しく作る）を渡し、宛先と、run が返したほかのレコード（同じ種類か writes の種類）を変えた結果を返す。
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
  changes.push(...otherChanges(source, target, done.others ?? []))
  const followed = withFollowed(world, ctx, action, source, changes)
  if (!followed.ok) return followed
  return {
    ok: true,
    result: done.result,
    ...followedOut(followed),
    ...(followed.records.length > 0 && Object.keys(used).length > 0 ? { counters: { [target]: used } } : {}),
    ...(done.aiEditTickets ? { aiEditTickets: done.aiEditTickets } : {}),
    ...(done.payloads ? { payloads: done.payloads } : {}),
    ...(done.refreshRequest ? { refreshRequest: done.refreshRequest } : {}),
  }
}

// run が返したほかのレコード others（種類を省いた物は target の種類。書庫が対象のアクションは省けず、perform が断っている）のうち、今と違う物の変わり
function otherChanges(
  source: RecordSource,
  target: string | undefined,
  others: readonly OtherRecord<never>[],
): RecordChange[] {
  return others.flatMap(o => {
    const kind = o.subject ?? target
    if (kind === undefined) return []
    const had = source.byId(kind, o.id)
    return (o.record === REMOVED ? had === undefined : o.record === had)
      ? []
      : [{ subject: kind, id: o.id, record: o.record as unknown }]
  })
}

// フォローステップが応じた結果（records は、アクションが変えたレコードと、応じて変えたレコード）
type FollowedIn = {
  ok: true
  records: readonly RecordChange[]
  followed: readonly { subject: string; id: string }[]
  hostMessages: readonly HostMessage[]
  changes?: TableChanges
  annotations: Annotations
  followedRows: readonly string[]
}

// アクション action が変えたレコード changes にフォローステップを当て、バックヤードの中に行う事を世界 world（アクションが変えた書庫を当てた後）に当てる。
// レコードが対象のアクションと書庫が対象のアクションで同じ決まりを使う
function withFollowed(
  world: World,
  ctx: ActionContext,
  action: ActionDef | undefined,
  source: RecordSource,
  changes: readonly RecordChange[],
): FollowedIn | Exclude<PerformedIn, { ok: true }> {
  const followed = action
    ? followChanges(ctx, action, source, changes)
    : { ok: true as const, records: changes, followed: [], backyard: [], hostMessages: [] }
  if (!followed.ok) return followed
  const yard = followedInBackyard(world, world.annotations, followed.backyard)
  if (!yard.ok) return { ok: false, reason: "needs-rows", books: yard.needs }
  if (action && yard.changes) {
    const kept = brokenIn(ctx, action, world, withChanges(world, yard.changes), "follow")
    if (kept) return { ok: false, reason: "denied", ...kept }
  }
  const removed = (rows: Readonly<Record<string, unknown>> = {}) =>
    Object.entries(rows).flatMap(([id, r]) => (r === REMOVED ? [id] : []))
  const retitled = (rows: TableChanges["folders"] = {}) =>
    Object.entries(rows).flatMap(([id, r]) => (r !== REMOVED && r.folderRole === "book" ? [id] : []))
  const followedRows = [
    ...new Set([
      ...Object.keys(yard.annotations),
      ...removed(yard.changes?.pages),
      ...removed(yard.changes?.folders),
      ...retitled(yard.changes?.folders),
    ]),
  ]
  return {
    ok: true,
    records: followed.records,
    followed: followed.followed,
    hostMessages: followed.hostMessages,
    ...(yard.changes ? { changes: yard.changes } : {}),
    annotations: yard.annotations,
    followedRows,
  }
}

// フォローステップが応じた結果 f の、PerformedIn に入れる物（空の物は入れない）
const followedOut = (f: FollowedIn) => ({
  ...(f.changes ? { changes: f.changes } : {}),
  ...(Object.keys(f.annotations).length > 0 ? { annotations: f.annotations } : {}),
  ...(f.followedRows.length > 0 ? { followedRows: f.followedRows } : {}),
  ...(f.hostMessages.length > 0 ? { hostMessages: f.hostMessages } : {}),
  ...(f.records.length > 0 ? { records: f.records } : {}),
  ...(f.followed.length > 0 ? { followed: f.followed } : {}),
})

// 書庫が対象のアクション id の結果 changed に、run が返したほかのレコード others の変わりと、それにフォローステップが応じた変わりを足す
// （バックヤードの中に行う事は、アクションが変えた書庫に当てる）
function withOthersFollowed(
  world: World,
  ctx: ActionContext,
  id: string,
  changed: Extract<PerformedIn, { ok: true }>,
  others: readonly OtherRecord<never>[],
): PerformedIn {
  const source = world.source ?? sourceOf(world.records)
  const changes = otherChanges(source, undefined, others)
  if (changes.length === 0) return changed
  const after: World = {
    ...world,
    ...(changed.changes ? withChanges(world, changed.changes) : {}),
    annotations: { ...world.annotations, ...changed.annotations },
  }
  const followed = withFollowed(after, ctx, ctx.catalog.actions.get(id), source, changes)
  if (!followed.ok) return followed
  const out = followedOut(followed)
  // アクションが足した行を、応じたフォローステップが消したなら、その行は変わりに残さない（前も後も無い）
  const merged = <T>(
    was: Readonly<Record<string, T>>,
    a: Readonly<Record<string, T | typeof REMOVED>>,
    b: Readonly<Record<string, T | typeof REMOVED>>,
  ) => Object.fromEntries(Object.entries({ ...a, ...b }).filter(([id, r]) => r !== REMOVED || id in was))
  const tables =
    changed.changes && out.changes
      ? {
          pages: merged(world.pages, changed.changes.pages, out.changes.pages),
          folders: merged(world.folders, changed.changes.folders, out.changes.folders),
        }
      : (out.changes ?? changed.changes)
  const annotations = { ...changed.annotations, ...out.annotations }
  return {
    ...changed,
    ...out,
    ...(tables ? { changes: tables } : {}),
    ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
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

// 認可ステップが読む、世界 world のレコードの読み口と書庫のフォルダ（アクションの文脈に、core の中だけで引く鍵で持たせる）
const inputsOf = (world: World): WithSource & WithFolders => ({
  [SOURCE]: world.source ?? sourceOf(world.records),
  [FOLDERS]: world.folders,
})

// ブックが対象のアクション action（id）の宛先（on の book）: ブックか、ブックの外のバインダ（そのバインダの id と、それを持っている書庫）。
// 無いか、ゴミ箱の中の物か、ブックの中のバインダか、ブックにだけ行えるアクション（takesBook）にバインダを名指したなら null。performIn と permittedIn で同じ決まりを使う
function targetLineupIn(
  catalog: CoreCatalog,
  world: World,
  action: string,
  on: ActionOn | undefined,
): Book | BinderOutsideBook | null {
  const id = (on && "book" in on ? on.book : undefined) ?? ""
  const book = bookOf(world, id)
  if (book) return inTrash(world.folders, book.id) ? null : book
  const def = catalog.actions.get(action)
  const library: Library = { pages: world.pages, folders: world.folders }
  if (!def || takesBook(def) || !outsideBinderIn(library, id)) return null
  return { book: NOT_IN_BOOK, binder: id, library }
}

// ゴミ箱の外のステージエントリ id の中身を、世界 world が持っていないか（持っていない物は、ここでは問えないので行えるとし、送った先の常駐が確かめる）
const heldNot = (world: World, id: string): boolean =>
  id !== "" && !inTrash(world.folders, id) && unheldIn(world, id).length > 0

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
    const at = targetLineupIn(ctx.catalog, world, id, on)
    if (!at && heldNot(world, (on && "book" in on ? on.book : undefined) ?? "")) return { ok: true }
    return at ? permitted(at, id, args, ctx) : { ok: false, reason: "no-book" }
  }
  if (target === "page" || target === "annotations") {
    const at = targetPageIn(world, on)
    const page = (on && "page" in on ? on.page : undefined) ?? ""
    if ("ok" in at && heldNot(world, bookIdOf(world.folders, page) ?? page)) return { ok: true }
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
