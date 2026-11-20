// 画面の状態の store（1 つ）。状態を変えるのは、ここの名前付きの操作と、ここから作るまだ見ていない変更（unseen.ts）だけ。
// 画面には読む口（state）と操作（actions）だけを渡し、setState は渡さない。計算は core の純粋な関数に任せる

import { createStore } from "zustand/vanilla"
import { USER } from "../core/actor"
import { addressOf, keepPlace, placeAt } from "../core/address"
import { restoreAllAnnotations, withAnnotations } from "../core/annotation"
import { checkBooks, distinctBooks, pageById } from "../core/book"
import { bulkActionOf, entersLibraryHistory, localDateOf, performBulk } from "../core/bulk"
import type { CoreCatalog } from "../core/core-catalog"
import type { ActionContext, ActionOn } from "../core/def/action"
import type { PluginStateDef } from "../core/def/plugin-state"
import { fail, matomezuError, type Problem, problem } from "../core/errors"
import { type Folder, homeAndFoldersOf, type Library, type PageRow, type TableChanges } from "../core/folders"
import { worldTablesOf } from "../core/folders-books"
import { settledOn, withChanges } from "../core/folders-changes"
import { outsideUnreadable, rawBooksOf } from "../core/folders-unreadable"
import { deepFreeze } from "../core/freeze"
import {
  HISTORY_LIMIT,
  type History,
  type HistoryStep,
  LIBRARY_HISTORY,
  NO_HISTORY,
  putBackStep,
  type RowChange,
  rowChangesOf,
} from "../core/history"
import { detectLang, type Lang } from "../core/i18n/i18n"
import type { Refused } from "../core/perform"
import { performIn } from "../core/perform-world"
import { restoreCounters, restoreRecords, withCounters, withRecords } from "../core/records"
import { sameData } from "../core/same"
import type { Book } from "../core/schema/book"
import { keyChangesOf, langOf, restoreSettings, type Settings } from "../core/settings"
import {
  closePicker,
  closePrintPreview,
  endBackground,
  openBook,
  openedPage,
  openPicker,
  openPrintPreview,
  panBy,
  resetView,
  resize,
  select,
  setArea,
  setEditing,
  setPreviewArea,
  setStart,
  shownPageId,
  startBackground,
  stopPlacing,
  zoomTo,
} from "../core/stage"
import type { Warning } from "../core/warnings"
import { NO_WIDE_SEARCH_HITS } from "../core/wide-search"
import {
  bookScreenCurrent,
  closeScreen,
  currentScreen,
  followLibraryIn,
  issueStage,
  makeCurrent,
  mapScreen,
  mapScreenOfStage,
  mapScreens,
  type OpenedScreen,
  openScreen,
  screenOfStage,
  setArrangement,
  shownBook,
  stageIn,
  type WindowState,
  withinLimits,
  withScreenProps,
} from "../core/window"
import {
  close,
  evenDivider,
  focus,
  followBook,
  MAX_STAGES,
  mapStage,
  moveDivider,
  setTool,
  showBinder,
  showPage,
  split,
  togglePlacing,
  unsplit,
  type Workspace,
} from "../core/workspace"
import { type Actions, boundActions, type Performed, SCREEN_REFUSED, windowActionsOf } from "./actions"
import { called, commandOwner, isEnabled } from "./commands"
import {
  type CommandActions,
  calledScreenIdOf,
  givenActions,
  givenScreenWrites,
  type UpdatePluginStateAt,
} from "./commands/def"
import { NO_STAGE, type OpenedPlace, openedAt } from "./dialogs"
import { findKey, type KeyTable, keyScopes, keyTable } from "./keys"
import { assemble, type Plugin } from "./plugin"
import {
  keptOutside,
  ownedPluginState,
  type PluginPlace,
  type PluginValues,
  placedOf,
  placeOf,
  pluginPlaceById,
  pluginValueOf,
  pushingIds,
  readPlaced,
  withPluginValueIn,
} from "./plugin-state"
import {
  booksAndTrashMaker,
  type DoneAction,
  type HostAnswer,
  initialState,
  type MatomezuInstance,
  type MatomezuState,
  type StoreOptions,
} from "./state"
import { createUnseenChanges } from "./unseen"
import { worldOf } from "./world"

// 場所 at（スクリーンの id か、ステージの id）のスクリーン
const screenAt = (win: WindowState, at: string): OpenedScreen | undefined =>
  win.screens.find(s => s.id === at) ?? screenOfStage(win, at)

// 開いている画面の履歴の段と、そのアクションバルク（同じ区切りなので 1 つで持つ）。step は閉じて画面の履歴に入れた段、refused はホストがアクションバルクを断ったこと。
// continued は続けた画面の履歴の段（continueStep）で、prior は続ける前の画面の履歴の段（断られたらこの段に戻す。続ける前に通っていた変更は元に戻せるまま残す）。
// books が空なら、画面の履歴に入れる変更が無い（アクションバルクだけ）。done は行ったアクションの並び、answer はホストの答え（settle で返す）
interface OpenStep {
  at: string
  done: DoneAction[]
  after: (() => void)[] // このアクションバルクを送った後ろで送る、自分だけのアクションバルク（bulk: "alone"）
  answer?: Promise<HostAnswer>
  settle?: (a: HostAnswer) => void
  books: string[]
  pages: Record<string, RowChange<PageRow>>
  folders: Record<string, RowChange<Folder>>
  // 書庫が対象のアクションが変えたページとフォルダ（書庫の履歴に、別の段として入れる）と、閉じて入れたその段
  library?: { pages: Record<string, RowChange<PageRow>>; folders: Record<string, RowChange<Folder>> }
  libraryStep?: HistoryStep
  continued?: true
  prior?: HistoryStep
  step?: HistoryStep
  // このアクションバルク（戻す・やり直す）を行って動かした画面の履歴の段と、動かす前に在った側（ホストが断ったら、その側へ戻す）
  moved?: { step: HistoryStep; from: "undo" | "redo" }
  refused?: true
}

function startLang(catalog: CoreCatalog, lang: Lang | readonly string[] = []): Lang {
  return detectLang(typeof lang === "string" ? [lang] : lang, [...catalog.languages.keys()])
}

export function createMatomezuInstance<const Ps extends readonly Plugin[]>(
  options: StoreOptions<Ps>,
): MatomezuInstance<Ps> {
  const { plugins } = options
  let defs = assemble(plugins, options.controlCenter ?? null, options.autoSkin)
  let { controlCenter } = defs
  let catalog = defs.catalog.core
  // 設定の言語の項目が選んでいないときの言語
  let fallback = startLang(catalog, options.lang)
  const booksAndTrashOf = booksAndTrashMaker()
  const saved = checkBooks(catalog, options.savedBooks ?? [])
  const savedSettings = restoreSettings(options.settings)
  const initial =
    options.initial ??
    initialState(
      booksAndTrashOf,
      catalog,
      [...(options.books ?? []), ...saved.books],
      savedSettings,
      langOf(catalog, savedSettings, fallback),
      saved.warnings,
      saved.partial,
    )
  const newId = options.newId ?? (() => crypto.randomUUID())
  const clock = options.now ?? (() => new Date().toISOString())
  // 状態は書き換えさせない（前の状態と変わらない所を共有しているので、その場で書き換えると前の状態まで変わる）。入れるたびに変わった所を凍らせる
  const store = createStore<MatomezuState>()(() => deepFreeze(initial))
  store.subscribe(deepFreeze)
  // ステージで開いている物・書庫の表・プラグイン状態（書庫アピアランスが見せているフォルダの材料）が替わったら、まだ見ていない画面の履歴の段が見えたかを確かめ直す（下で作る checkSeen）
  store.subscribe((now, was) => {
    if (
      now.window !== was.window ||
      now.books !== was.books ||
      now.folders !== was.folders ||
      now.pluginValues !== was.pluginValues
    )
      checkSeen()
  })
  const { getState, setState } = store
  // 時点と日付は、時計を 1 回読んだ同じ時点から決める（日付の変わり目でずれない）
  const ctx = (): Omit<ActionContext, "naming"> => {
    const now = clock()
    return { catalog, controlCenter, lang: getState().lang, newId, now, today: localDateOf(now), actor: USER }
  }
  // 残した・知らされたブックを確かめた値（読めたブックか、読めない warning。同じ値は確かめ直さない）
  let checked = new WeakMap<object, { book: Book; partial: readonly Warning[] } | { warning: Warning }>()
  const restore = (saved: readonly unknown[]): { books: Book[]; warnings: Warning[]; partial: Warning[] } => {
    const books: Book[] = []
    const warnings: Warning[] = []
    const partial: Warning[] = []
    for (const b of saved) {
      if (typeof b !== "object" || b === null) continue
      let hit = checked.get(b)
      if (!hit) {
        const done = checkBooks(catalog, [b])
        const [book] = done.books
        const [warning] = done.warnings
        hit = book ? { book, partial: done.partial } : warning ? { warning } : undefined
        if (!hit) continue
        checked.set(b, hit)
      }
      if ("book" in hit) {
        books.push(hit.book)
        partial.push(...hit.partial)
      } else warnings.push(hit.warning)
    }
    // 1 冊ずつ確かめた後に、ブックどうしで id が重ならないかを確かめる（重なるブックは読めないブックにする）
    const distinct = distinctBooks(books)
    return {
      books: distinct.books,
      warnings: [...warnings, ...distinct.warnings],
      partial: partial.filter(p => distinct.books.some(b => b.id === p.params.book)),
    }
  }
  // キーバインドの表（利用者の変更が変わったときだけ作り直す）
  let keyCache: { settings: Settings; table: KeyTable } | null = null
  const keysFor = (settings: Settings): KeyTable => {
    if (keyCache?.settings !== settings)
      keyCache = { settings, table: keyTable([...defs.catalog.store.keys.values()], keyChangesOf(catalog, settings)) }
    return keyCache.table
  }
  // いちばん最近カレントにしたブックスクリーンのステージの並びに操作をかける
  const withWorkspace = (change: (ws: Workspace) => Workspace) => withWindow(win => mapScreen(win, change))
  // ステージ stage を並べているブックスクリーンのステージの並びに操作をかける（どのブックスクリーンのステージでも届く）
  const withStageScreen = (stage: string, change: (ws: Workspace) => Workspace) =>
    withWindow(win => mapScreenOfStage(win, stage, change))
  // どのステージの道具のアイコンも閉じた窓
  const pickersClosed = (win: WindowState) =>
    mapScreens(win, ws => ws.stages.reduce((w, s) => mapStage(w, s.id, closePicker), ws))
  const withWindow = (change: (win: WindowState) => WindowState) => {
    const { window: win } = getState()
    const next = change(win)
    if (next !== win) commit({ window: next })
  }
  // 開いている画面の履歴の段: 同じ処理（同期の 1 回の流れ。コマンド・ダイアログの確定・ドラッグの離しなど）の中で行ったアクションを 1 つの画面の履歴の段にまとめ、処理が終わったら
  // 画面の履歴に入れる（入れた画面の履歴の段が変えたブックの、やり直せる画面の履歴の段は消す）。コマンドを行う前にも入れる（戻すコマンドが、すぐ前の操作を見られるように）
  let open: OpenStep | null = null
  // ブックごとの、最後に画面の履歴に入れた画面の履歴の段（元に戻す・やり直すで動かしたら消す。continueStep で続けられるのはこれだけ）
  let lastPut: Record<string, HistoryStep> = {}
  const closeStep = () => {
    if (!open) return
    const was = open
    open = null
    sendBulk(was)
    for (const send of was.after) send()
    putStep(was)
  }
  // 閉じたアクションバルクを observe に渡し、答えを待っている所に返す（断られたら画面の履歴の段を捨てる）
  const sendBulk = (was: OpenStep) => {
    if (was.done.length === 0) return
    const answer = options.observe?.(was.done)
    if (!answer) {
      was.settle?.({ ok: true })
      return
    }
    void answer.then(a => {
      was.settle?.(a)
      if (!a.ok) dropRefused(was)
    })
  }
  // 同じ段の中で足して無くした物は、前も後も無いので持たない
  const keptRows = <T>(rows: Record<string, RowChange<T>>) =>
    Object.fromEntries(Object.entries(rows).filter(([, r]) => r.before !== "none" || r.after !== "none"))
  // 閉じた段のうち、書庫が対象のアクションが変えた分を、書庫の履歴に入れる（入れる前にホストが断ったなら入れない）
  const putLibraryStep = (was: OpenStep) => {
    if (!was.library || was.refused) return
    const step: HistoryStep = {
      at: was.at,
      by: "user",
      books: [LIBRARY_HISTORY],
      pages: keptRows(was.library.pages),
      folders: keptRows(was.library.folders),
    }
    if ([...Object.values(step.pages), ...Object.values(step.folders)].every(r => sameData(r.before, r.after))) return
    was.libraryStep = step
    const history = { ...getState().history }
    history[LIBRARY_HISTORY] = {
      undo: [...(history[LIBRARY_HISTORY] ?? NO_HISTORY).undo, step].slice(-HISTORY_LIMIT),
      redo: [],
    }
    setState({ history })
  }
  // 閉じた段を画面の履歴に入れる
  const putStep = (was: OpenStep) => {
    putLibraryStep(was)
    if (was.books.length === 0 && !was.continued) return
    const { at, continued } = was
    const kept = keptRows
    const step: HistoryStep = {
      at,
      by: "user",
      books: was.books,
      pages: kept(was.pages),
      folders: kept(was.folders),
    }
    // 入れる前にホストが断ったなら入れない（続けた画面の履歴の段なら、続ける前の画面の履歴の段に戻す）
    if (was.refused) {
      if (was.prior) putBack(was.prior)
      return
    }
    // 続けた画面の履歴の段で何も変わらなかった（足した物を書かずに消したなど）なら入れない
    if (
      continued &&
      [...Object.values(step.pages), ...Object.values(step.folders)].every(r => sameData(r.before, r.after))
    )
      return
    was.step = step
    const history = { ...getState().history }
    for (const id of step.books)
      history[id] = { undo: [...(history[id] ?? NO_HISTORY).undo, step].slice(-HISTORY_LIMIT), redo: [] }
    setState({ history })
    lastPut = { ...lastPut, ...Object.fromEntries(step.books.map(id => [id, step])) }
  }
  // 続ける前の画面の履歴の段 prior を、画面の履歴の最後に戻す（続けた画面の履歴の段が断られたとき）
  const putBack = (prior: HistoryStep) => {
    const history = { ...getState().history }
    for (const id of prior.books)
      history[id] = { undo: [...(history[id] ?? NO_HISTORY).undo, prior].slice(-HISTORY_LIMIT), redo: [] }
    setState({ history })
    lastPut = { ...lastPut, ...Object.fromEntries(prior.books.map(id => [id, prior])) }
  }
  // まだ見ていない、AI とほかの窓の変更（unseen.ts。機能台帳は組み直しで差し替わるので、getter で渡す）
  const {
    checkSeen,
    dropOverwritten,
    dropOverwrittenInLibrary,
    addForeign,
    reset: resetUnseen,
  } = createUnseenChanges({
    getState,
    setState,
    catalog: () => catalog,
    storeCatalog: () => defs.catalog.store,
    clock,
    options,
  })
  // ブック book の物を、表 was から changes のとおりに変えたことを、開いている画面の履歴の段に足す（同じ物を続けて変えたら、最初の前と最後の後を持つ）
  const record = (book: string, was: Library, changes: TableChanges, at: string): OpenStep => {
    const into = opened(at)
    if (!into.books.includes(book)) into.books.push(book)
    const rows = rowChangesOf(was, changes)
    for (const [id, r] of Object.entries(rows.pages))
      into.pages[id] = { before: into.pages[id]?.before ?? r.before, after: r.after }
    for (const [id, r] of Object.entries(rows.folders))
      into.folders[id] = { before: into.folders[id]?.before ?? r.before, after: r.after }
    return into
  }
  // 書庫が対象のアクションが、表 was を changes のとおりに変えたことを、開いている画面の履歴の段の、書庫の分に足す
  const recordLibrary = (was: Library, changes: TableChanges, at: string) => {
    const into = opened(at)
    const mine = into.library ?? { pages: {}, folders: {} }
    into.library = mine
    const rows = rowChangesOf(was, changes)
    for (const [id, r] of Object.entries(rows.pages))
      mine.pages[id] = { before: mine.pages[id]?.before ?? r.before, after: r.after }
    for (const [id, r] of Object.entries(rows.folders))
      mine.folders[id] = { before: mine.folders[id]?.before ?? r.before, after: r.after }
  }
  // 行ったアクション sent を、開いているアクションバルクに足し、そのアクションバルクへのホストの答えを返す
  const joinBulk = (sent: DoneAction, at: string): Promise<HostAnswer> | undefined => {
    const bulk = opened(at)
    bulk.done.push(sent)
    if (options.observe && !bulk.answer)
      bulk.answer = new Promise<HostAnswer>(settle => {
        bulk.settle = settle
      })
    return bulk.answer
  }
  // bulk: "alone" のアクション sent を、自分だけのアクションバルクで送り、ホストの答えを返す（開いているアクションバルクがあれば、それを送った後ろに回す。
  // 同じ処理の中で前に行ったアクションが作った物を、このアクションが変えることがあるため）。種類が対象のアクションだけなので、画面の履歴の段は無い
  const sendAlone = (sent: DoneAction): Promise<HostAnswer> | undefined => {
    if (!options.observe) return undefined
    const behind = open
    if (!behind) return options.observe([sent])
    return new Promise<HostAnswer>(settle => {
      behind.after.push(() => {
        const answer = options.observe?.([sent])
        if (answer) void answer.then(settle)
        else settle({ ok: true })
      })
    })
  }
  // 開いている段とアクションバルク（無ければ開き、同期の流れが終わったら閉じる）
  const opened = (at: string): OpenStep => {
    if (!open) {
      open = { at, done: [], after: [], books: [], pages: {}, folders: {} }
      queueMicrotask(closeStep)
    }
    return open
  }
  // ホストが断ったアクションを入れた画面の履歴の段 at を捨てる（その段は、断られた変更を戻そうとして、その間のほかの変更を消してしまうため。
  // 同じ段のほかのアクションの変更も、元に戻すで戻せなくなる。ただし続けた画面の履歴の段なら、続ける前の画面の履歴の段は戻し、その変更は元に戻せるまま残す）
  const dropRefused = (at: OpenStep) => {
    at.refused = true
    if (at.moved) {
      const { step: moved, from } = at.moved
      const history = { ...getState().history }
      for (const id of moved.books) history[id] = putBackStep(history[id] ?? NO_HISTORY, moved, from)
      setState({ history })
    }
    const inLibrary = at.libraryStep
    if (inLibrary) {
      const was = getState().history[LIBRARY_HISTORY] ?? NO_HISTORY
      setState({
        history: {
          ...getState().history,
          [LIBRARY_HISTORY]: {
            undo: was.undo.filter(s => s !== inLibrary),
            redo: was.redo.filter(s => s !== inLibrary),
          },
        },
      })
    }
    const step = at.step
    if (!step) return
    const history = { ...getState().history }
    for (const id of step.books) {
      const was = history[id] ?? NO_HISTORY
      history[id] = { undo: was.undo.filter(s => s !== step), redo: was.redo.filter(s => s !== step) }
    }
    lastPut = Object.fromEntries(Object.entries(lastPut).filter(([, s]) => s !== step))
    setState({ history })
    if (at.prior) putBack(at.prior)
  }
  // アクションを行い、入れる状態の差分を返す（入れるのは呼んだ側。ほかの変更と一度に入れられるように）
  const run = (
    id: string,
    args: unknown,
    on?: ActionOn,
  ):
    | { ok: true; result: unknown; next: Partial<MatomezuState>; answer: Promise<HostAnswer> | undefined }
    | Refused
    | { ok: false; reason: "no-book" | "no-record" } => {
    const { books, pages, folders, window, annotations } = getState()
    const ids: string[] = []
    const c = ctx()
    const done = performIn(worldOf(getState()), id, args, on, {
      ...c,
      newId: () => {
        const made = c.newId()
        ids.push(made)
        return made
      },
    })
    if (!done.ok) return done
    const sent: DoneAction = { action: id, args, ...(on ? { on } : {}), ids, lang: c.lang, now: c.now, today: c.today }
    const answer = catalog.actions.get(id)?.bulk === "alone" ? sendAlone(sent) : joinBulk(sent, c.now)
    const next: Partial<MatomezuState> = {}
    if (done.changes) {
      const tables = withChanges({ pages, folders }, done.changes)
      const both = booksAndTrashOf(tables)
      next.pages = tables.pages
      next.folders = tables.folders
      next.books = both.books
      next.trash = both.trash
      if (catalog.actions.get(id)?.target === "library") {
        next.window = followLibraryIn(window, catalog, both.books, books)
        // 画面の履歴に入れないアクション（戻す・やり直す・ゴミ箱から消すなど）が消した物は、その前の値を画面の履歴の段に残さないので捨てる
        if (!entersLibraryHistory(catalog.actions.get(id))) {
          for (const after of Object.values(both.books)) {
            const before = books[after.id]
            if (before && before !== after) dropOverwritten(before, after)
          }
          dropOverwrittenInLibrary({ pages, folders }, tables)
        } else recordLibrary({ pages, folders }, done.changes, c.now)
      } else {
        // ブックかページが対象のアクションが変えるのは、開けるブック 1 冊
        const after = Object.values(both.books).find(b => books[b.id] !== b)
        const before = after && books[after.id]
        const recorded = catalog.actions.get(id)?.history !== false
        if (after && before && recorded) record(after.id, { pages, folders }, done.changes, c.now)
        // 画面の履歴に入れないアクション（ロックの掛け外しなど）が上書きした物は、その前の値を画面の履歴の段に残さないので捨てる
        if (after && before && !recorded) dropOverwritten(before, after)
        if (after) next.window = mapScreens(window, ws => followBook(catalog, ws, after, before))
      }
    }
    if (done.settings) {
      next.settings = done.settings
      next.lang = langOf(catalog, done.settings, fallback)
    }
    if (done.annotations) next.annotations = withAnnotations(annotations, done.annotations)
    if (done.records) next.records = withRecords(getState().records, done.records)
    if (done.counters) next.counters = withCounters(getState().counters, done.counters)
    return { ok: true, result: done.result, next, answer }
  }
  // 状態の差分を入れる（何も変わらなければ知らせない）。開いたステージが無くなったダイアログと右クリックのメニューは閉じ、そのステージごとのプラグイン状態は消す
  const commit = (next: Partial<MatomezuState>) => {
    if (Object.keys(next).length === 0) return
    const { dialog, contextMenu } = getState()
    const stages = next.window?.screens.flatMap(s => s.stages?.stages ?? [])
    // 開いたステージ（ステージを持たずに開いたダイアログは、開いたスクリーン）が無くなったか
    const screensNow = next.window?.screens
    const gone = (opened: OpenedPlace | null) => {
      if (opened === null) return false
      if (opened.stage !== NO_STAGE) return stages !== undefined && !stages.some(s => s.id === opened.stage)
      return screensNow !== undefined && !screensNow.some(s => s.id === opened.screen)
    }
    const values = next.pluginValues ?? getState().pluginValues
    const kept = stages && Object.keys(values.stages).filter(id => stages.some(s => s.id === id))
    // 閉じたスクリーンのプラグイン状態も消す
    const opened = next.window?.screens
    const keptScreens = opened && Object.keys(values.screens).filter(id => opened.some(s => s.id === id))
    const fewer =
      (kept !== undefined && kept.length < Object.keys(values.stages).length) ||
      (keptScreens !== undefined && keptScreens.length < Object.keys(values.screens).length)
    setState({
      ...next,
      ...(gone(dialog) ? { dialog: null } : {}),
      ...(gone(contextMenu) ? { contextMenu: null } : {}),
      ...(fewer
        ? {
            pluginValues: {
              ...values,
              stages: kept ? Object.fromEntries(kept.map(id => [id, values.stages[id] ?? {}])) : values.stages,
              screens: keptScreens
                ? Object.fromEntries(keptScreens.map(id => [id, values.screens[id] ?? {}]))
                : values.screens,
            },
          }
        : {}),
    })
  }
  // 今の画面の場所（画面の場所に入れるプラグイン状態の値も）
  const addressNow = () => {
    const { window, pluginValues } = getState()
    const placed = defs.catalog.store.pluginStates
    return addressOf(
      window,
      stage => placedOf(placed, "stage", pluginValues.stages[stage]),
      placedOf(placed, "window", pluginValues.window),
      screen => placedOf(placed, "screen", pluginValues.screens[screen]),
    )
  }
  // ステージ stage が窓のどれかのブックスクリーンにあるか
  const inWindow = (stage: string) => stageIn(getState().window, stage) !== undefined
  // 場所 at（ステージか、ステージを持たないスクリーン）から開く、ダイアログ・右クリックのメニューの開いた場所: ステージからなら、そのステージと、それを並べているスクリーン。
  // スクリーンからなら、ステージは持たない。at が窓に無ければ undefined
  const placeOpenedFrom = (at: string): OpenedPlace | undefined => {
    const win = getState().window
    const screen = screenOfStage(win, at)?.id ?? win.screens.find(s => s.id === at)?.id
    return screen === undefined ? undefined : { stage: inWindow(at) ? at : NO_STAGE, screen }
  }
  let toasts = 0 // トーストの id の番号（出すたびに 1 つ進める）
  // プラグイン状態の宣言 id の値を value にした値の組 values（plugin-state.ts の withPluginValueIn。今の台帳の宣言と今の窓で決める）
  const withPluginValue = (values: PluginValues, id: string, at: PluginPlace, value: unknown): PluginValues =>
    withPluginValueIn(defs.catalog.store.pluginStates, getState().window, values, id, at, value)
  const setPluginStates = (changes: readonly (readonly [id: string, at: PluginPlace, value: unknown])[]) => {
    const now = getState().pluginValues
    const next = changes.reduce((v, [id, at, value]) => withPluginValue(v, id, at, value), now)
    if (next !== now) setState({ pluginValues: next })
  }
  const setPluginState = (id: string, at: PluginPlace, value: unknown) => setPluginStates([[id, at, value]])
  const setPluginStateById = (
    id: string,
    value: unknown,
    caller: { screen?: string; screenDef?: string; stage?: string },
  ): boolean => {
    const at = pluginPlaceById(defs.catalog.store.pluginStates, getState().window, id, value, caller)
    if (at === null) return false
    setPluginState(id, at, value)
    return true
  }
  const actions: Actions = {
    perform: (id, ...[args, on]) => {
      const done = run(id, args, on)
      if (!done.ok) return done
      commit(done.next)
      return { ok: true, result: done.result } as Performed<typeof id>
    },
    performConfirmed: async (id, ...[args, on]) => {
      const done = run(id, args, on)
      if (!done.ok) return done
      commit(done.next)
      const a = await done.answer
      if (a && !a.ok) return { ok: false, reason: a.reason, by: "host" }
      return { ok: true, result: done.result } as Performed<typeof id>
    },
    command: (stage, id, ...args) => {
      if (!open?.continued) closeStep() // continueStep で続けている段は、このコマンドが行うアクションを足すまで閉じない
      const state = getState()
      const call = called(defs, state, stage, id)
      if (!call || !isEnabled(defs, state, stage, id, args[0])) return false
      const owner = commandOwner(id)
      // 1 回のコマンドで複数の値を書いても、store には 1 回で書く（途中の、片方だけ変わった状態を知らせない）。読む値は、書いた分を重ねたもの
      const pending: [string, PluginPlace, unknown][] = []
      const working = () =>
        pending.reduce((v, [id, st, value]) => withPluginValue(v, id, st, value), getState().pluginValues)
      const updatePluginState = <S>(stateDef: PluginStateDef<S>, change: (now: S | undefined) => S | undefined) => {
        const own = ownedPluginState(owner, stateDef)
        // スクリーンごとの宣言は、呼ばれた場所のスクリーンの値
        const at = placeOf(own.scope, { stage, screen: calledScreenIdOf(call.ctx) })
        const next = change(pluginValueOf(working(), at, own))
        withPluginValue(working(), own.id, at, next) // 書く前に、範囲と形を確かめる
        pending.push([own.id, at, next])
      }
      // ほかのスクリーン screen の、スクリーンごとの宣言の値（base のコマンドだけが updatePluginStateAtOf で使う）
      const updatePluginStateAt: UpdatePluginStateAt = (screen, stateDef, change) => {
        const own = ownedPluginState(owner, stateDef)
        // 渡したスクリーンに書くのはスクリーンごとの宣言だけ（ステージ・窓の範囲の宣言を、呼ばれた場所に黙って書かない）
        if (own.scope !== "screen") fail("E124", { id: own.id, scope: own.scope, need: "use updatePluginState" })
        const at = placeOf(own.scope, { stage, screen })
        const next = change(pluginValueOf(working(), at, own))
        withPluginValue(working(), own.id, at, next)
        pending.push([own.id, at, next])
      }
      const run = call.def.run as (ctx: unknown, actions: CommandActions, args: never) => void
      // 呼ばれた場所（ステージか、スクリーン）に向けた操作
      const given: CommandActions = { ...windowActionsOf(actions), ...boundActions(actions, stage), updatePluginState }
      givenActions.set(given, actions)
      givenScreenWrites.set(given, updatePluginStateAt)
      run(call.ctx, given, args[0] as never)
      if (pending.length > 0) {
        const now = getState().pluginValues
        const next = working()
        if (next !== now) setState({ pluginValues: next })
      }
      return true
    },
    openDialog: (at, id, ...args) => {
      if (!defs.catalog.store.dialogs.has(id)) fail("E108", { id })
      const place = placeOpenedFrom(at)
      if (place) setState({ dialog: { id, ...place, args: args[0], submitted: 0, preview: null } })
    },
    closeDialog: () => {
      if (getState().dialog) setState({ dialog: null })
    },
    previewDialog: preview => {
      const { dialog } = getState()
      if (dialog && (dialog.preview !== null || preview !== null)) setState({ dialog: { ...dialog, preview } })
    },
    submitDialog: () => {
      const { dialog } = getState()
      if (dialog) setState({ dialog: { ...dialog, submitted: dialog.submitted + 1 } })
    },
    pressKey: (key, scopes, reach) => {
      const { contextMenu, dialog, window, settings } = getState()
      const table = keysFor(settings)
      // 長押しの道具のアイコンを開いているステージ（どのブックスクリーンのステージでも）
      const picker = window.screens.flatMap(x => x.stages?.stages ?? []).find(st => st.picker !== null)?.id
      // キーの宛先: 右クリックのメニューを開いた場所（ステージか、ステージを持たないスクリーン）・長押しの道具・ダイアログを開いたステージ。
      // 無ければ（ステージを持たずに開いたダイアログも）、カレントスクリーンのカレントのステージ（ステージを持たなければ、そのスクリーン）
      const opener = dialog && dialog.stage !== NO_STAGE ? dialog.stage : undefined
      const current = currentScreen(window)
      const stage =
        (contextMenu ? openedAt(contextMenu) : undefined) ?? picker ?? opener ?? current.stages?.current ?? current.id
      // プレゼンテーションのキーの範囲は、ページを開いているときだけ（空のバインダでは、プレゼンテーションのビューを描かない）
      const type = openedPage(stageIn(window, stage)?.opened ?? null)?.type
      const presentation = type && catalog.pageTypes.get(type)?.presentation
      const shown = presentation ? catalog.presentations.get(presentation)?.keyScope : undefined
      const openNow = {
        menu: contextMenu !== null,
        picker: picker !== undefined,
        dialog: dialog !== null,
        center: !bookScreenCurrent(window),
      }
      for (const scope of keyScopes(openNow, scopes, shown, reach)) {
        const hit = findKey(table, scope, key)
        if (!hit) continue
        const { command, args } = hit.binding
        const call = actions.command as (stage: string, id: string, ...args: unknown[]) => boolean
        // その場で使えないコマンドなら、次の範囲の同じキーを探す
        if (call(stage, command, ...(args === undefined ? [] : [args]))) return true
      }
      return false
    },
    // 右クリックのメニューと道具のアイコンは同時に開かない（開くと、道具のアイコンを閉じる）
    openContextMenu: (from, id, target, at, opens = "down") => {
      const place = placeOpenedFrom(from)
      if (!place) return
      const { window: win } = getState()
      const closed = pickersClosed(win)
      commit({ contextMenu: { id, ...place, target, at, opens }, ...(closed === win ? {} : { window: closed }) })
    },
    closeContextMenu: () => {
      if (getState().contextMenu) setState({ contextMenu: null })
    },
    showToast: toast => {
      const id = `toast-${++toasts}`
      setState({ toasts: [...getState().toasts, { ...toast, id }] })
      return id
    },
    dismissToast: id => {
      const { toasts: now } = getState()
      if (now.some(t => t.id === id)) setState({ toasts: now.filter(t => t.id !== id) })
    },
    tryPerform: (id, ...[args, on]) => {
      const done = performIn(worldOf(getState()), id, args, on, ctx())
      return (done.ok ? { ok: true, result: done.result } : done) as Performed<typeof id>
    },
    openScreenId: (def, props) => {
      const fits = catalog.screens.get(def)?.props.safeParse(props)
      if (!fits?.success) return SCREEN_REFUSED
      const { win, id } = openScreen(getState().window, catalog, def, fits.data)
      commit({ window: withinLimits(win, catalog) })
      return id
    },
    openScreen: (def, props) => actions.openScreenId(def, props) !== SCREEN_REFUSED,
    showBookStage: (bookId, page) => {
      const book = getState().books[bookId]
      if (!book) return NO_STAGE
      const { win, stage } = shownBook(getState().window, catalog, book)
      if (win !== getState().window) commit({ window: win })
      if (page !== undefined) actions.openPage(stage, page)
      return stage
    },
    showBook: (bookId, page) => actions.showBookStage(bookId, page) !== NO_STAGE,
    setScreenProps: (at, props) => {
      const screen = screenAt(getState().window, at)
      const fits = screen && catalog.screens.get(screen.def)?.props.safeParse(props)
      if (!screen || !fits?.success) return false
      withWindow(win => withScreenProps(win, screen.id, fits.data))
      return true
    },
    makeScreenCurrent: id => withWindow(win => makeCurrent(win, id)),
    setScreenArrangement: (def, value) => withWindow(win => setArrangement(win, catalog, def, value)),
    replaceHistory: () => setState({ historyReplaces: getState().historyReplaces + 1 }),
    closeScreen: at => {
      const screen = screenAt(getState().window, at)
      if (screen) withWindow(win => closeScreen(win, catalog, screen.id))
    },
    showStage: id =>
      withWindow(win =>
        makeCurrent(
          mapScreenOfStage(win, id, ws => focus(ws, id)),
          screenOfStage(win, id)?.id ?? "",
        ),
      ),
    // 無いステージ（閉じたステージなど）への分割は、カレントへの分割にしない
    splitStage: stage => {
      let added = NO_STAGE
      withWindow(win => {
        const ws = screenOfStage(win, stage)?.stages
        if (!ws) return win
        const focused = focus(ws, stage)
        if (focused.stages.length >= MAX_STAGES) return mapScreenOfStage(win, stage, () => focused)
        const { win: issued, id } = issueStage(win)
        added = id
        return mapScreenOfStage(issued, stage, () => split(focused, id))
      })
      return added
    },
    split: stage => {
      actions.splitStage(stage)
    },
    unsplit: stage => withStageScreen(stage, ws => unsplit(focus(ws, stage))),
    moveDivider: (x, width) => withWorkspace(ws => moveDivider(ws, x, width)),
    evenDivider: () => withWorkspace(evenDivider),
    closeStage: id => withStageScreen(id, ws => close(ws, id)),
    focusStage: id => withStageScreen(id, ws => focus(ws, id)),
    openBook: (stage, bookId) => {
      const book = getState().books[bookId]
      // ブックを開くと、そのブックスクリーンをカレントスクリーンにする
      if (book && inWindow(stage))
        withWindow(win =>
          makeCurrent(
            mapScreenOfStage(win, stage, ws => mapStage(focus(ws, stage), stage, s => openBook(catalog, s, book))),
            screenOfStage(win, stage)?.id ?? "",
          ),
        )
    },
    openPage: (stage, page) => {
      const { books, window } = getState()
      const book = books[stageIn(window, stage)?.opened?.outermost ?? ""]
      // ページを開くと、そのブックスクリーンをカレントスクリーンにする
      if (book && inWindow(stage))
        withWindow(win =>
          makeCurrent(
            mapScreenOfStage(win, stage, ws => showPage(catalog, focus(ws, stage), stage, book, page)),
            screenOfStage(win, stage)?.id ?? "",
          ),
        )
    },
    openBinder: (stage, binder) => {
      const { books, window } = getState()
      const book = books[stageIn(window, stage)?.opened?.outermost ?? ""]
      // バインダを開くと、そのブックスクリーンをカレントスクリーンにする
      if (book && inWindow(stage))
        withWindow(win =>
          makeCurrent(
            mapScreenOfStage(win, stage, ws => showBinder(catalog, focus(ws, stage), stage, book, binder)),
            screenOfStage(win, stage)?.id ?? "",
          ),
        )
    },
    openPageById: (stage, page) => {
      const at = pageById(getState().books, page)
      if (!at) return
      if (stageIn(getState().window, stage)?.opened?.outermost !== at.book.id) actions.openBook(stage, at.book.id)
      actions.openPage(stage, page)
    },
    resizeStage: (id, view) => withStageScreen(id, ws => mapStage(ws, id, s => resize(s, view))),
    setStageArea: (id, area, origin) => withStageScreen(id, ws => mapStage(ws, id, s => setArea(s, area, origin))),
    setStageStart: (id, start) => withStageScreen(id, ws => mapStage(ws, id, s => setStart(s, start))),
    panStageBy: (id, dx, dy) => withStageScreen(id, ws => mapStage(ws, id, s => panBy(s, dx, dy))),
    zoomStage: (id, zoom, at) => withStageScreen(id, ws => mapStage(ws, id, s => zoomTo(s, zoom, at))),
    resetStageView: id => withStageScreen(id, ws => mapStage(ws, id, resetView)),
    openPrintPreview: id => withStageScreen(id, ws => mapStage(ws, id, openPrintPreview)),
    closePrintPreview: id => withStageScreen(id, ws => mapStage(ws, id, closePrintPreview)),
    startBackground: id => withStageScreen(id, ws => mapStage(ws, id, s => startBackground(catalog, s))),
    endBackground: id => withStageScreen(id, ws => mapStage(ws, id, endBackground)),
    requestPrint: () => setState({ printRequests: getState().printRequests + 1 }),
    requestBack: () => {
      if (getState().canGoBack) setState({ backRequests: getState().backRequests + 1 })
    },
    setPreviewArea: (id, area) => withStageScreen(id, ws => mapStage(ws, id, s => setPreviewArea(s, area))),
    setTool: (id, tool) => withStageScreen(id, ws => setTool(catalog, ws, id, tool)),
    togglePlacing: (id, item, props) => withStageScreen(id, ws => togglePlacing(catalog, ws, id, item, props)),
    stopPlacing: id => withStageScreen(id, ws => mapStage(ws, id, s => stopPlacing(s))),
    select: (id, ids) => withStageScreen(id, ws => mapStage(ws, id, s => select(s, ids))),
    setEditing: (id, editing) => withStageScreen(id, ws => mapStage(ws, id, s => setEditing(s, editing))),
    // 道具のアイコンを開けたら、右クリックのメニューを閉じる（同時に開かない）
    openPicker: (id, at) => {
      const { window: win, contextMenu } = getState()
      const next = mapScreenOfStage(pickersClosed(win), id, ws => mapStage(ws, id, s => openPicker(s, at)))
      if (next === win) return
      const opened = (stageIn(next, id)?.picker ?? null) !== null
      commit({ window: next, ...(opened && contextMenu ? { contextMenu: null } : {}) })
    },
    closePicker: () => withWindow(pickersClosed),
    continueStep: book => {
      closeStep()
      const { history } = getState()
      const step = history[book]?.undo.at(-1)
      if (!step || step !== lastPut[book]) return
      const next = { ...history }
      for (const id of step.books) {
        const was = next[id] ?? NO_HISTORY
        next[id] = { ...was, undo: was.undo.filter(s => s !== step) }
      }
      setState({ history: next })
      open = {
        at: step.at,
        done: [],
        after: [],
        books: [...step.books],
        pages: { ...step.pages },
        folders: { ...step.folders },
        continued: true,
        prior: step,
      }
      queueMicrotask(closeStep)
    },
    moveHistory: (book, from) => {
      const bulk = open
      closeStep()
      const to = from === "undo" ? "redo" : "undo"
      const { history } = getState()
      const step = (history[book] ?? NO_HISTORY)[from].at(-1)
      if (!step) return
      if (bulk) bulk.moved = { step, from }
      lastPut = Object.fromEntries(Object.entries(lastPut).filter(([id]) => !step.books.includes(id)))
      const next = { ...history }
      for (const id of step.books) {
        const was = next[id] ?? NO_HISTORY
        next[id] = { ...was, [from]: was[from].filter(s => s !== step), [to]: [...was[to], step] } as History
      }
      setState({ history: next })
    },
    // moveHistory と同じく、先に開いている段を閉じて画面の履歴に入れ（同じ処理の中で行ったアクションの段も、最後の段として捨てられるように）、
    // 段が触ったブックの最後に入れた段を忘れる（元に戻す・やり直すのあとは、continueStep で前の段に足さない）
    dropHistory: (book, from) => {
      closeStep()
      const { history } = getState()
      const step = (history[book] ?? NO_HISTORY)[from].at(-1)
      if (!step) return
      lastPut = Object.fromEntries(Object.entries(lastPut).filter(([id]) => !step.books.includes(id)))
      const next = { ...history }
      for (const id of step.books) {
        const was = next[id] ?? NO_HISTORY
        next[id] = { ...was, [from]: was[from].filter(s => s !== step) } as History
      }
      setState({ history: next })
    },
  }
  const instance: MatomezuInstance<Ps> = {
    ...defs,
    plugins,
    state: store,
    actions,
    receive: (world, replay, change) => {
      const found = restore(rawBooksOf(world.pages, world.folders))
      const now = getState()
      // 確かめた世界の表（中身の同じページ・フォルダは、今の値に寄せる。組んだブックも同じ値のままになる）
      let tables = settledOn(worldTablesOf(found.books, homeAndFoldersOf(world.folders)), now)
      // よその変更を、まだ見ていない変更に足す（確かめた世界の表から比べる）
      addForeign(change, tables)
      let settings = restoreSettings(world.settings)
      let annotations = restoreAllAnnotations(world.annotations)
      let records = world.records === undefined ? getState().records : restoreRecords(world.records)
      let counters = world.counters === undefined ? getState().counters : restoreCounters(world.counters)
      for (const bulk of replay) {
        // 読み直した世界の上で行い直して投げるアクションバルクは、断られたものと同じに落とし、あとの行い直しを続ける
        const next = (() => {
          try {
            return performBulk(
              { ...tables, settings, annotations, records, counters },
              bulk.map(done => bulkActionOf(done, newId, done.now, done.lang)),
              { catalog, controlCenter, lang: bulk[0]?.lang ?? getState().lang, actor: USER },
            )
          } catch {
            return null
          }
        })()
        if (!next?.ok) continue
        if (next.changes) tables = settledOn(withChanges(tables, next.changes), now)
        if (next.settings) settings = next.settings
        if (next.records) records = withRecords(records, next.records)
        counters = withCounters(counters, next.counters)
        annotations = withAnnotations(annotations, next.annotations)
      }
      const { books, trash } = booksAndTrashOf(tables)
      if (sameData(settings, now.settings)) settings = now.settings
      if (sameData(annotations, now.annotations)) annotations = now.annotations
      if (sameData(records, now.records)) records = now.records
      if (sameData(counters, now.counters)) counters = now.counters
      const unreadable = sameData(found.warnings, now.unreadable) ? now.unreadable : found.warnings
      const partial = sameData(found.partial, now.partial) ? now.partial : found.partial
      const moved = outsideUnreadable(world.pages, world.folders).unreadable
      const unreadableFolder = sameData(moved, now.unreadableFolder) ? now.unreadableFolder : moved
      // ホストが知らせた値は、無いか変わっていなければ今の値のまま
      const kept = <T>(next: T | undefined, current: T): T =>
        next === undefined || sameData(next, current) ? current : next
      const touched = kept(world.touched, now.touched)
      const participantCalls = kept(world.participantCalls, now.participantCalls)
      const participantReady = kept(world.participantReady, now.participantReady)
      const participantLive = kept(world.participantLive, now.participantLive)
      commit({
        ...(touched === now.touched ? {} : { touched }),
        ...(participantCalls === now.participantCalls ? {} : { participantCalls }),
        ...(participantReady === now.participantReady ? {} : { participantReady }),
        ...(participantLive === now.participantLive ? {} : { participantLive }),
        ...(tables.pages === now.pages ? {} : { pages: tables.pages }),
        ...(tables.folders === now.folders ? {} : { folders: tables.folders }),
        ...(trash === now.trash ? {} : { trash }),
        ...(books === now.books ? {} : { books, window: followLibraryIn(now.window, catalog, books, now.books) }),
        ...(settings === now.settings ? {} : { settings, lang: langOf(catalog, settings, fallback) }),
        ...(annotations === now.annotations ? {} : { annotations }),
        ...(records === now.records ? {} : { records }),
        ...(counters === now.counters ? {} : { counters }),
        ...(unreadable === now.unreadable ? {} : { unreadable }),
        ...(partial === now.partial ? {} : { partial }),
        ...(unreadableFolder === now.unreadableFolder ? {} : { unreadableFolder }),
      })
      checkSeen()
    },
    checkSeen,
    search: query => options.search?.(query) ?? Promise.resolve(NO_WIDE_SEARCH_HITS),
    copyText: async text => {
      if (!options.copyText) fail("E404")
      await options.copyText(text)
    },
    purgeUnreadable: async id => {
      if (!options.unreadableHost) fail("E406")
      return await options.unreadableHost.purge(id)
    },
    movedIfOff: async ids => {
      if (!options.unreadableHost) fail("E406")
      return await options.unreadableHost.movedIfOff(ids)
    },
    setWindowTitle: title => options.setWindowTitle?.(title),
    windowTitle: () => options.windowTitle?.() ?? "",
    ...(options.startupError ? { startupError: options.startupError } : {}),
    ...(options.unreadableNotice ? { unreadableNotice: options.unreadableNotice } : {}),
    address: () => addressNow(),
    locate: address => {
      const now = getState()
      if (sameData(addressNow(), address)) {
        const kept = keepPlace(now.window)
        if (kept !== now.window) commit({ window: kept })
        return
      }
      const win = placeAt(catalog, now.books, now.window, address)
      const placed = defs.catalog.store.pluginStates
      // 場所の値で、画面の場所に入れる宣言の値を丸ごと置き換える（形に合わない値・宣言の無い id・入れない宣言の id は落とし、入れない宣言の値は残す。空になったステージの組は持たない）
      const stages: Record<string, Readonly<Record<string, unknown>>> = {}
      for (const screen of win.screens) {
        const places = address.screens.find(x => x.id === screen.id)?.stages?.places
        screen.stages?.stages.forEach((st, i) => {
          const next = {
            ...keptOutside(placed, "stage", now.pluginValues.stages[st.id]),
            ...readPlaced(
              placed,
              "stage",
              places ? places[i]?.states : placedOf(placed, "stage", now.pluginValues.stages[st.id]),
            ),
          }
          if (Object.keys(next).length > 0) stages[st.id] = next
        })
      }
      // スクリーンごとの宣言の値も同じ（場所に無いスクリーンの値は、今のまま）
      const screens: Record<string, Readonly<Record<string, unknown>>> = {}
      for (const screen of win.screens) {
        const place = address.screens.find(x => x.id === screen.id)
        const next = {
          ...keptOutside(placed, "screen", now.pluginValues.screens[screen.id]),
          ...readPlaced(
            placed,
            "screen",
            place ? place.states : placedOf(placed, "screen", now.pluginValues.screens[screen.id]),
          ),
        }
        if (Object.keys(next).length > 0) screens[screen.id] = next
      }
      const pluginValues: PluginValues = {
        window: {
          ...keptOutside(placed, "window", now.pluginValues.window),
          ...readPlaced(placed, "window", address.window),
        },
        stages,
        screens,
      }
      commit({
        ...(win === now.window ? {} : { window: win }),
        ...(sameData(pluginValues, now.pluginValues) ? {} : { pluginValues }),
      })
    },
    setPluginState,
    setPluginStateById,
    setPluginStates,
    pushing: () => pushingIds(defs.catalog.store.pluginStates),
    setEditLock: (key, lock) => {
      const { [key]: now, ...rest } = getState().editLocks
      if (!lock) {
        if (now) setState({ editLocks: rest })
      } else if (!now || !sameData(now, lock)) setState({ editLocks: { ...rest, [key]: lock } })
    },
    startWindow: () => {
      const perform = actions.perform as (id: string, args: unknown) => unknown
      const opened = { lang: getState().lang }
      for (const a of catalog.actions.values()) {
        const args = a.runsAtWindowStart?.(opened, catalog)
        if (args != null) perform(a.id, args)
      }
    },
    setOffline: offline => {
      if (getState().offline !== offline) setState({ offline })
    },
    setCanGoBack: can => {
      if (getState().canGoBack !== can) setState({ canGoBack: can })
    },
    setLastWindow: last => {
      if (getState().lastWindow !== last) setState({ lastWindow: last })
    },
    keys: () => keysFor(getState().settings),
    use: (added, check) => {
      const failed: Problem[] = []
      let used: Plugin[] = []
      let next = assemble(plugins, options.controlCenter ?? null, options.autoSkin)
      for (const p of added) {
        try {
          const all = [...plugins, ...used, p]
          const tried = assemble(all, options.controlCenter ?? null, options.autoSkin)
          check?.(all)
          used = [...used, p]
          next = tried
        } catch (error) {
          failed.push(problem("E318", { plugin: p.id, reason: error instanceof Error ? error.message : String(error) }))
        }
      }
      if (failed.length > 0) throw matomezuError(problem("E317", { count: failed.length }), failed)
      // 開いていたスクリーンは、組み直したあとに同じ場所へ当てはめ直す
      const at = addressNow()
      defs = next
      controlCenter = next.controlCenter
      catalog = next.catalog.core
      checked = new WeakMap()
      keyCache = null
      fallback = startLang(catalog, options.lang)
      Object.assign(instance, next, { plugins: [...plugins, ...used] })
      resetUnseen()
      const { settings } = getState()
      const again = checkBooks(catalog, options.savedBooks ?? [])
      setState(
        initialState(
          booksAndTrashOf,
          catalog,
          [...(options.books ?? []), ...again.books],
          settings,
          langOf(catalog, settings, fallback),
          again.warnings,
          again.partial,
        ),
        true,
      )
      instance.locate(at)
    },
  }
  return instance
}

// インスタンスのステージ stage で開いているブックとページの id（何も開いていない・無いステージなら null）。テストが、開いた物を確かめるのに使う
export const openedIn = (
  instance: Pick<MatomezuInstance, "state">,
  stage = "s1",
): { book: string; page: string | null } | null => {
  const opened = stageIn(instance.state.getState().window, stage)?.opened
  return opened ? { book: opened.outermost, page: shownPageId(opened) } : null
}
