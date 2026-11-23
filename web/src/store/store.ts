// 画面の状態の store（1 つ）。状態を変えるのは、ここの名前付きの操作と、ここから作るまだ見ていない変更（unseen.ts）だけ。
// 画面には読む口（state）と操作（actions）だけを渡し、setState は渡さない。計算は core の純粋な関数に任せる

import { createStore } from "zustand/vanilla"
import { USER } from "../core/actor"
import { addressOf, keepPlace, placeAt } from "../core/address"
import { restoreAllAnnotations, withAnnotations } from "../core/annotation"
import { readLibrary } from "../core/book"
import { bulkActionOf, entersLibraryHistory, laterThan, localDateOf, performBulk } from "../core/bulk"
import type { CoreCatalog } from "../core/core-catalog"
import { type ActionContext, type ActionOn, NO_CONTROL_CENTER } from "../core/def/action"
import { type PluginStateDef, stateRead, storedOf } from "../core/def/plugin-state"
import { fail, matomezuError, type Problem, problem } from "../core/errors"
import { type Folder, homeOver, type Library, type PageRow, type TableChanges } from "../core/folders"
import { recordsOf } from "../core/folders-books"
import { settledOn, withChanges } from "../core/folders-changes"
import { outsideBinderIn, outsidePageIn } from "../core/folders-tree"
import { outsideUnreadable, rawBooksOf } from "../core/folders-unreadable"
import { deepFreeze } from "../core/freeze"
import {
  changesByOutermost,
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
import { openablePage } from "../core/library"
import type { Refused } from "../core/perform"
import { performIn } from "../core/perform-world"
import { restoreCounters, restoreRecords, withCounters, withRecords } from "../core/records"
import { sameData } from "../core/same"
import { keyChangesOf, langOf, restoreSettings, type Settings } from "../core/settings"
import {
  closePicker,
  closePrintPreview,
  endBackground,
  NO_PAGE,
  NOTHING_OPENED,
  openBook,
  openedBook,
  openedEntry,
  openedPage,
  openOutsideBinder,
  openOutsidePage,
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
  shownOutsideBinder,
  shownOutsidePage,
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
  givenScreenResets,
  givenScreenWrites,
  givenWindowReads,
  type ResetPluginStateAt,
  type UpdatePluginStateAt,
} from "./commands/def"
import { NO_DIALOG_PREVIEW, NO_STAGE, type OpenedPlace, openedAt } from "./dialogs"
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
  type LibraryLoaded,
  type LibraryRows,
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
// outermosts が空なら、画面の履歴に入れる変更が無い（アクションバルクだけ）。done は行ったアクションの並び、answer はホストの答え（settle で返す）
interface OpenStep {
  seq: number
  done: DoneAction[]
  after: (() => void)[] // このアクションバルクを送った後ろで送る、自分だけのアクションバルク（bulk: "alone"）
  answer?: Promise<HostAnswer>
  settle?: (a: HostAnswer) => void
  outermosts: string[]
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
  let defs = assemble(plugins, options.controlCenter ?? NO_CONTROL_CENTER, options.autoSkin)
  let { controlCenter } = defs
  let catalog = defs.catalog.core
  // 設定の言語の項目が選んでいないときの言語
  let fallback = startLang(catalog, options.lang)
  const booksAndTrashOf = booksAndTrashMaker()
  // 最後に読んだ行（作ったときは残した行と books の行。知らせを受けたら、その行）。機能台帳を組み直したら読み直す
  let rows = startRows(options)
  // 行 rows を今の機能台帳で読んだ書庫（窓の書庫の表は、起動・知らせ・組み直しのどれも、常駐のエンジンと同じ readLibrary で読む）と、読めない物のフォルダの直下の物
  const loadRows = (): LibraryLoaded => {
    const read = readLibrary(catalog, rows.pages, rows.folders)
    return {
      library: read.library,
      warnings: read.warnings,
      partial: read.partial,
      unreadableFolder: outsideUnreadable(rows.pages, rows.folders).unreadable,
    }
  }
  const savedSettings = restoreSettings(options.settings)
  const initial =
    options.initial ??
    initialState(booksAndTrashOf, catalog, loadRows(), savedSettings, langOf(catalog, savedSettings, fallback))
  const newId = options.newId ?? (() => crypto.randomUUID())
  // この窓が決める時点（ctx.now）。時計が後ろへ戻っても、前に決めた時点より後にする（laterThan）
  const readClock = options.now ?? (() => new Date().toISOString())
  let lastNow: string | undefined
  const clock = () => {
    const read = readClock()
    lastNow = lastNow === undefined ? read : laterThan(lastNow, read)
    return lastNow
  }
  // 画面の履歴の段に振る、この窓で始めた順の番号（HistoryStep.seq）
  let lastSeq = 0
  const nextSeq = () => ++lastSeq
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
  // 画面の履歴に入れる（入れた画面の履歴の段が変えたステージエントリの、やり直せる画面の履歴の段は消す）。コマンドを行う前にも入れる（戻すコマンドが、すぐ前の操作を見られるように）
  let open: OpenStep | null = null
  // ステージエントリごとの、最後に画面の履歴に入れた画面の履歴の段（元に戻す・やり直すで動かしたら消す。continueStep で続けられるのはこれだけ）
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
      seq: was.seq,
      by: "user",
      outermosts: [LIBRARY_HISTORY],
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
    if (was.outermosts.length === 0 && !was.continued) return
    const { seq, continued } = was
    const kept = keptRows
    const step: HistoryStep = {
      seq,
      by: "user",
      outermosts: was.outermosts,
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
    for (const id of step.outermosts)
      history[id] = { undo: [...(history[id] ?? NO_HISTORY).undo, step].slice(-HISTORY_LIMIT), redo: [] }
    setState({ history })
    lastPut = { ...lastPut, ...Object.fromEntries(step.outermosts.map(id => [id, step])) }
  }
  // 続ける前の画面の履歴の段 prior を、画面の履歴の最後に戻す（続けた画面の履歴の段が断られたとき）
  const putBack = (prior: HistoryStep) => {
    const history = { ...getState().history }
    for (const id of prior.outermosts)
      history[id] = { undo: [...(history[id] ?? NO_HISTORY).undo, prior].slice(-HISTORY_LIMIT), redo: [] }
    setState({ history })
    lastPut = { ...lastPut, ...Object.fromEntries(prior.outermosts.map(id => [id, prior])) }
  }
  // まだ見ていない、AI とほかの窓の変更（unseen.ts。機能台帳は組み直しで差し替わるので、getter で渡す）
  const {
    checkSeen,
    dropOverwritten,
    addForeign,
    reset: resetUnseen,
  } = createUnseenChanges({
    getState,
    setState,
    catalog: () => catalog,
    storeCatalog: () => defs.catalog.store,
    nextSeq,
    options,
  })
  // ステージエントリ outermost の物を、表 was から changes のとおりに変えたことを、開いている画面の履歴の段に足す（同じ物を続けて変えたら、最初の前と最後の後を持つ）
  const record = (outermost: string, was: Library, changes: TableChanges): OpenStep => {
    const into = opened()
    if (!into.outermosts.includes(outermost)) into.outermosts.push(outermost)
    const rows = rowChangesOf(was, changes)
    for (const [id, r] of Object.entries(rows.pages))
      into.pages[id] = { before: into.pages[id]?.before ?? r.before, after: r.after }
    for (const [id, r] of Object.entries(rows.folders))
      into.folders[id] = { before: into.folders[id]?.before ?? r.before, after: r.after }
    return into
  }
  // 書庫が対象のアクションが、表 was を changes のとおりに変えたことを、開いている画面の履歴の段の、書庫の分に足す
  const recordLibrary = (was: Library, changes: TableChanges) => {
    const into = opened()
    const mine = into.library ?? { pages: {}, folders: {} }
    into.library = mine
    const rows = rowChangesOf(was, changes)
    for (const [id, r] of Object.entries(rows.pages))
      mine.pages[id] = { before: mine.pages[id]?.before ?? r.before, after: r.after }
    for (const [id, r] of Object.entries(rows.folders))
      mine.folders[id] = { before: mine.folders[id]?.before ?? r.before, after: r.after }
  }
  // 行ったアクション sent を、開いているアクションバルクに足し、そのアクションバルクへのホストの答えを返す
  const joinBulk = (sent: DoneAction): Promise<HostAnswer> | undefined => {
    const bulk = opened()
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
  const opened = (): OpenStep => {
    if (!open) {
      open = { seq: nextSeq(), done: [], after: [], outermosts: [], pages: {}, folders: {} }
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
      for (const id of moved.outermosts) history[id] = putBackStep(history[id] ?? NO_HISTORY, moved, from)
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
    for (const id of step.outermosts) {
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
    const { books, pages, folders, window, annotations, staleBuild } = getState()
    if (staleBuild && staleBuild.from.dataVersion !== staleBuild.to.dataVersion)
      return { ok: false, reason: "refused", kind: "stale-build" }
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
    // 画面はブックを全部持つので、行を足して行い直す断り（needs-rows）は起きない。起きたら断る
    if (!done.ok) return done.reason === "needs-rows" ? { ok: false, reason: "refused" } : done
    const sent: DoneAction = { action: id, args, ...(on ? { on } : {}), ids, lang: c.lang, now: c.now, today: c.today }
    const answer = catalog.actions.get(id)?.bulk === "alone" ? sendAlone(sent) : joinBulk(sent)
    const next: Partial<MatomezuState> = {}
    if (done.changes) {
      const tables = withChanges({ pages, folders }, done.changes)
      const both = booksAndTrashOf(tables)
      next.pages = tables.pages
      next.folders = tables.folders
      next.books = both.books
      next.trash = both.trash
      const target = catalog.actions.get(id)?.target
      if (target === "library" || target === "settings") {
        next.window = followLibraryIn(window, catalog, { books: both.books, ...tables }, { books, pages, folders })
        // 画面の履歴に入れないアクション（戻す・やり直す・ゴミ箱から消すなど）が消した物は、その前の値を画面の履歴の段に残さないので捨てる。
        // 設定が対象のアクションが変える書庫（言語を初めて選んで付けた番号）も、常駐が書庫を整えるときと同じく、画面の履歴に入れない
        if (target === "settings" || !entersLibraryHistory(catalog.actions.get(id)))
          dropOverwritten({ pages, folders }, tables)
        else recordLibrary({ pages, folders }, done.changes)
      } else {
        // ブックかページが対象のアクションが変えるのは、開けるブック 1 冊か、ブックの外のページ 1 枚
        const changed = Object.keys(changesByOutermost({ pages, folders }, tables, done.changes))
        const recorded = catalog.actions.get(id)?.history !== false
        if (recorded) for (const outermost of changed) record(outermost, { pages, folders }, done.changes)
        // 画面の履歴に入れないアクション（ロックの掛け外しなど）が上書きした物は、その前の値を画面の履歴の段に残さないので捨てる
        else if (changed.length > 0) dropOverwritten({ pages, folders }, tables)
        const after = Object.values(both.books).find(b => books[b.id] !== b)
        if (after) next.window = mapScreens(window, ws => followBook(catalog, ws, after, books[after.id]))
        // ブックが変わらなければ、変えたのはブックの外のページ
        else next.window = followLibraryIn(window, catalog, { books: both.books, ...tables }, { books, pages, folders })
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
      // 呼ばれた場所の、宣言 stateDef の値を next にする（undefined なら消す）
      const writeHere = (
        stateDef: PluginStateDef<unknown>,
        next: (own: PluginStateDef<unknown>, at: PluginPlace) => unknown,
      ) => {
        const own = ownedPluginState(owner, stateDef)
        // スクリーンごとの宣言は、呼ばれた場所のスクリーンの値
        const at = placeOf(own.scope, { stage, screen: calledScreenIdOf(call.ctx) })
        const value = next(own, at)
        withPluginValue(working(), own.id, at, value) // 書く前に、範囲と形を確かめる
        pending.push([own.id, at, value])
      }
      const updatePluginState: CommandActions["updatePluginState"] = (stateDef, change) =>
        writeHere(stateDef, (own, at) => storedOf(change(stateRead(stateDef, pluginValueOf(working(), at, own)))))
      const resetPluginState = (stateDef: PluginStateDef<unknown>) => writeHere(stateDef, () => undefined)
      // ほかのスクリーン screen の、スクリーンごとの宣言の値（base のコマンドだけが updatePluginStateAtOf で使う）
      const updatePluginStateAt: UpdatePluginStateAt = (screen, stateDef, change) => {
        const own = ownedPluginState(owner, stateDef)
        // 渡したスクリーンに書くのはスクリーンごとの宣言だけ（ステージ・窓の範囲の宣言を、呼ばれた場所に黙って書かない）
        if (own.scope !== "screen") fail("E124", { id: own.id, scope: own.scope, need: "use updatePluginState" })
        const at = placeOf(own.scope, { stage, screen })
        const next = storedOf(change(stateRead(stateDef, pluginValueOf(working(), at, own))))
        withPluginValue(working(), own.id, at, next)
        pending.push([own.id, at, next])
      }
      // ほかのスクリーン screen の、スクリーンごとの宣言の値を消す（base のコマンドだけが resetPluginStateAtOf で使う）
      const resetPluginStateAt: ResetPluginStateAt = (screen, stateDef) => {
        const own = ownedPluginState(owner, stateDef)
        if (own.scope !== "screen") fail("E124", { id: own.id, scope: own.scope, need: "use resetPluginState" })
        const at = placeOf(own.scope, { stage, screen })
        withPluginValue(working(), own.id, at, undefined)
        pending.push([own.id, at, undefined])
      }
      const run = call.def.run as (ctx: unknown, actions: CommandActions, args: never) => void
      // 呼ばれた場所（ステージか、スクリーン）に向けた操作
      const given: CommandActions = {
        ...windowActionsOf(actions),
        ...boundActions(actions, stage),
        updatePluginState,
        resetPluginState,
      }
      givenActions.set(given, actions)
      givenScreenWrites.set(given, updatePluginStateAt)
      givenScreenResets.set(given, resetPluginStateAt)
      givenWindowReads.set(given, () => getState().window)
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
      if (place) setState({ dialog: { id, ...place, args: args[0], submitted: 0, preview: NO_DIALOG_PREVIEW } })
    },
    closeDialog: () => {
      if (getState().dialog) setState({ dialog: null })
    },
    previewDialog: preview => {
      const { dialog } = getState()
      if (dialog && (dialog.preview !== NO_DIALOG_PREVIEW || preview !== NO_DIALOG_PREVIEW))
        setState({ dialog: { ...dialog, preview } })
    },
    submitDialog: () => {
      const { dialog } = getState()
      if (dialog) setState({ dialog: { ...dialog, submitted: dialog.submitted + 1 } })
    },
    pressKey: (key, scopes, reach) => {
      const { contextMenu, dialog, window, settings, staleBuild } = getState()
      if (staleBuild) return false // 読み込み直すのを待つ間は、どのキーも効かせない
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
      const shownPage = openedPage(stageIn(window, stage)?.opened ?? NOTHING_OPENED)
      const type = shownPage === NO_PAGE ? undefined : shownPage.type
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
    showOutsidePageStage: id => {
      const { pages, folders, window } = getState()
      const page = outsidePageIn({ pages, folders }, id)
      if (!page) return NO_STAGE
      const { win, stage } = shownOutsidePage(window, catalog, page)
      if (win !== window) commit({ window: win })
      return stage
    },
    openOutsidePage: (stage, id) => {
      const { pages, folders } = getState()
      const page = outsidePageIn({ pages, folders }, id)
      if (!page || !inWindow(stage)) return NO_STAGE
      withWindow(win =>
        makeCurrent(
          mapScreenOfStage(win, stage, ws => mapStage(focus(ws, stage), stage, s => openOutsidePage(catalog, s, page))),
          screenOfStage(win, stage)?.id ?? "",
        ),
      )
      return stage
    },
    showOutsideBinderStage: (id, page) => {
      const { pages, folders, window } = getState()
      const binder = outsideBinderIn({ pages, folders }, id)
      if (!binder) return NO_STAGE
      const { win, stage } = shownOutsideBinder(window, catalog, binder, page)
      if (win !== window) commit({ window: win })
      return stage
    },
    openOutsideBinder: (stage, id, page) => {
      const { pages, folders } = getState()
      const binder = outsideBinderIn({ pages, folders }, id)
      if (!binder || !inWindow(stage)) return NO_STAGE
      withWindow(win =>
        makeCurrent(
          mapScreenOfStage(win, stage, ws =>
            mapStage(focus(ws, stage), stage, s => openOutsideBinder(catalog, s, binder, page)),
          ),
          screenOfStage(win, stage)?.id ?? "",
        ),
      )
      return stage
    },
    openToStage: (to, stage) => {
      if (to.to === "binder")
        return stage === NO_STAGE
          ? actions.showOutsideBinderStage(to.binder, to.page)
          : actions.openOutsideBinder(stage, to.binder, to.page)
      if (to.to === "page")
        return stage === NO_STAGE ? actions.showOutsidePageStage(to.page) : actions.openOutsidePage(stage, to.page)
      const at = stage === NO_STAGE ? actions.showBookStage(to.book, to.page) : stage
      if (at === NO_STAGE) return NO_STAGE
      if (stage !== NO_STAGE) {
        actions.openBook(at, to.book)
        if (to.page !== undefined) actions.openPage(at, to.page)
      }
      if (to.binder !== undefined) actions.openBinder(at, to.binder)
      return at
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
      const { books, window, pages, folders } = getState()
      const opened = stageIn(window, stage)?.opened
      const at = openedEntry(opened)
      // ブックの外のバインダを開いたステージでは、そのバインダの中のページへ替える
      if (at?.kind === "binder") {
        const binder = outsideBinderIn({ pages, folders }, at.id)
        if (binder?.lineup.some(p => p.id === page)) actions.openOutsideBinder(stage, binder.id, page)
        return
      }
      // ブックの外のページ 1 枚を開いたステージでは、そのページを名指せば印刷プレビューを閉じる
      if (at?.kind === "page") {
        if (at.id === page) actions.closePrintPreview(stage)
        return
      }
      const book = openedBook(books, opened)
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
      const book = openedBook(books, stageIn(window, stage)?.opened)
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
      const at = openablePage(getState(), page)
      if (!at) return
      const { kind, id } = at.outermost
      if (openedEntry(stageIn(getState().window, stage)?.opened)?.id === id) actions.openPage(stage, page)
      else
        actions.openToStage(
          kind === "book"
            ? { to: "book", book: id, page }
            : kind === "binder"
              ? { to: "binder", binder: id, page }
              : { to: "page", page },
          stage,
        )
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
    continueStep: outermost => {
      closeStep()
      const { history } = getState()
      const step = history[outermost]?.undo.at(-1)
      if (!step || step !== lastPut[outermost]) return
      const next = { ...history }
      for (const id of step.outermosts) {
        const was = next[id] ?? NO_HISTORY
        next[id] = { ...was, undo: was.undo.filter(s => s !== step) }
      }
      setState({ history: next })
      open = {
        seq: step.seq,
        done: [],
        after: [],
        outermosts: [...step.outermosts],
        pages: { ...step.pages },
        folders: { ...step.folders },
        continued: true,
        prior: step,
      }
      queueMicrotask(closeStep)
    },
    moveHistory: (outermost, from) => {
      const bulk = open
      closeStep()
      const to = from === "undo" ? "redo" : "undo"
      const { history } = getState()
      const step = (history[outermost] ?? NO_HISTORY)[from].at(-1)
      if (!step) return
      if (bulk) bulk.moved = { step, from }
      lastPut = Object.fromEntries(Object.entries(lastPut).filter(([id]) => !step.outermosts.includes(id)))
      const next = { ...history }
      for (const id of step.outermosts) {
        const was = next[id] ?? NO_HISTORY
        next[id] = { ...was, [from]: was[from].filter(s => s !== step), [to]: [...was[to], step] } as History
      }
      setState({ history: next })
    },
    // moveHistory と同じく、先に開いている段を閉じて画面の履歴に入れ（同じ処理の中で行ったアクションの段も、最後の段として捨てられるように）、
    // 段が触ったブックの最後に入れた段を忘れる（元に戻す・やり直すのあとは、continueStep で前の段に足さない）
    dropHistory: (outermost, from) => {
      closeStep()
      const { history } = getState()
      const step = (history[outermost] ?? NO_HISTORY)[from].at(-1)
      if (!step) return
      lastPut = Object.fromEntries(Object.entries(lastPut).filter(([id]) => !step.outermosts.includes(id)))
      const next = { ...history }
      for (const id of step.outermosts) {
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
      rows = { pages: world.pages, folders: world.folders }
      const found = loadRows()
      const now = getState()
      // 確かめた世界の表（中身の同じページ・フォルダは、今の値に寄せる。組んだブックも同じ値のままになる）
      let tables = settledOn(found.library, now)
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
      const unreadableFolder = sameData(found.unreadableFolder, now.unreadableFolder)
        ? now.unreadableFolder
        : found.unreadableFolder
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
        ...(books === now.books ? {} : { books }),
        ...(tables.pages === now.pages && tables.folders === now.folders
          ? {}
          : { window: followLibraryIn(now.window, catalog, { books, ...tables }, now) }),
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
    command: options.command ?? "matomezu",
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
      const win = placeAt(catalog, now.books, { pages: now.pages, folders: now.folders }, now.window, address)
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
    setStaleBuild: staleBuild => setState({ staleBuild }),
    setUpdateStatus: updateStatus => setState({ updateStatus }),
    setHostStatus: hostStatus => setState({ hostStatus }),
    setHostPeers: hostPeers => setState({ hostPeers }),
    askHosts: async request => {
      if (!options.hostsHost) fail("E412")
      await options.hostsHost.ask(request)
    },
    checkUpdate: async () => {
      if (!options.updateHost) fail("E409")
      await options.updateHost.check()
    },
    askUpdate: async workroom => {
      if (!options.updateHost) fail("E409")
      return await options.updateHost.ask(workroom)
    },
    reloadWindow: () => options.reloadWindow?.(),
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
      let next = assemble(plugins, options.controlCenter ?? NO_CONTROL_CENTER, options.autoSkin)
      for (const p of added) {
        try {
          const all = [...plugins, ...used, p]
          const tried = assemble(all, options.controlCenter ?? NO_CONTROL_CENTER, options.autoSkin)
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
      keyCache = null
      fallback = startLang(catalog, options.lang)
      Object.assign(instance, next, { plugins: [...plugins, ...used] })
      resetUnseen()
      const { settings } = getState()
      setState(initialState(booksAndTrashOf, catalog, loadRows(), settings, langOf(catalog, settings, fallback)), true)
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
  if (opened === undefined || opened === NOTHING_OPENED) return null
  const page = shownPageId(opened)
  return { book: opened.outermost.id, page: page === NO_PAGE ? null : page }
}

// 作ったときに読む行: 残した行 saved と、books を分けた行（core/folders-books.ts の recordsOf）。
// 書庫ホームの行が無ければ（ホストの無い窓とテスト。常駐の置き場所はいつも持つ）、どのフォルダ（ゴミ箱も）にも持たれていないブックを並べた書庫ホームの行を足す
function startRows(options: Pick<StoreOptions, "saved" | "books">): LibraryRows {
  const made = (options.books ?? []).map(recordsOf)
  const pages = [...(options.saved?.pages ?? []), ...made.flatMap(r => r.pages)]
  const folders = [...(options.saved?.folders ?? []), ...made.flatMap(r => r.folders)]
  const roleOf = (f: unknown) => (f as { folderRole?: unknown } | null)?.folderRole
  if (folders.some(f => roleOf(f) === "home")) return { pages, folders }
  const held = new Set(
    folders.flatMap(f => {
      const lineup = (f as { lineup?: unknown } | null)?.lineup
      return Array.isArray(lineup) ? lineup.map(r => (r as { id?: unknown } | null)?.id) : []
    }),
  )
  const books = rawBooksOf(pages, folders).flatMap(b => {
    const id = (b as { id?: unknown } | null)?.id
    return typeof id === "string" && !held.has(id) ? [{ id }] : []
  })
  return { pages, folders: [...folders, homeOver(books)] }
}
