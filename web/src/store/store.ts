// 画面の状態の store（1 つ）。状態を変えるのは、ここの名前付きの操作だけ。
// 画面には読む口（state）と操作（actions）だけを渡し、setState は渡さない。計算は core の純粋な関数に任せる

import { createStore, type StoreApi } from "zustand/vanilla"
import { type Address, addressOf, placeAt } from "../core/address"
import { checkBooks, hasPages, singleBooks } from "../core/book"
import type { ActionId, DialogId, ItemId, MessageKey, SingleBookTypeId, SkinId, ToolId } from "../core/catalog"
import type { CoreCatalog } from "../core/core-catalog"
import type { ActionContext } from "../core/def/action"
import { fail } from "../core/errors"
import type { Point, Size } from "../core/geom"
import { detectLang, type Lang, type Params } from "../core/i18n/i18n"
import { type KeyChanges, NO_KEY_CHANGES } from "../core/keys"
import { type ArgsOf, performIn, type Refusal, type ResultOf, type TargetOf } from "../core/perform"
import type { Book } from "../core/schema/book"
import { NO_TEXT_COLORS, restoreSettings, type Settings } from "../core/settings"
import {
  closePicker,
  openBook,
  openPicker,
  panBy,
  resetView,
  resize,
  select,
  setEditing,
  setMinimap,
  showPickerMap,
  stopPlacing,
  zoomTo,
} from "../core/stage"
import type { Warning } from "../core/warnings"
import {
  close,
  evenDivider,
  focus,
  followBook,
  followLibrary,
  hasStage,
  mapStage,
  moveDivider,
  newWorkspace,
  setTool,
  showPage,
  split,
  togglePlacing,
  unsplit,
  type Workspace,
} from "../core/workspace"
import { type CommandArgs, type CommandId, commandContext, commandDef, isEnabled } from "./commands"
import type { OpenedContextMenu } from "./context-menus"
import type { DialogArgs, DialogPreview, OpenedDialog } from "./dialogs"
import { findKey, type KeyTable, keyScopes, keyTable } from "./keys"
import { type Assembled, assemble, type Plugin } from "./plugin"

export type { Settings } from "../core/settings"

export interface MatomezuState {
  books: Record<string, Book> // ブックの id ごと
  unreadable: readonly Warning[] // 残したブックのうち読めないもの（warning W004〜W006。データには手を付けず、開けない）
  partial: readonly Warning[] // 読めるが、機能台帳に無いアイテムや設定の項目を持つブック（warning W007。無い物はそのまま残す）
  workspace: Workspace
  settings: Settings
  dialog: OpenedDialog | null
  contextMenu: OpenedContextMenu | null
  toasts: readonly Toast[] // 出しているトースト（古い順）
  // ブックの id → 触れた（開いたか書いた）時刻（ISO 8601 の UTC）。ホストが知らせたもの（receive）で、無ければ空
  touched: Readonly<Record<string, string>>
}

// トースト: 画面に出して、しばらくすると消える知らせ。info は普通の知らせ、warn は断りを知らせ、error は失敗を知らせて直るまで出しておく
// （時間では消えず、出した側か見る人が消す）。文言は鍵で持ち、画面が今の言語で出す
export interface Toast {
  id: string
  kind: "info" | "warn" | "error"
  message: MessageKey
  params?: Params
}
// トーストを出しておく時間（ms）。null は時間では消さない
export const TOAST_MS: Readonly<Record<Toast["kind"], number | null>> = { info: 3500, warn: 7000, error: null }

// アクションの宛先。ブックが対象のアクションは、どのブックかを渡す（一覧と設定は 1 つしかないので渡さない）
export type PerformArgs<Id extends ActionId> =
  TargetOf<Id> extends "book" ? [args: ArgsOf<Id>, on: { book: string }] : [args: ArgsOf<Id>]
// 行ったアクションの結果。no-book は宛先のブックが無いとき
export type Performed<Id extends ActionId> =
  | { ok: true; result: ResultOf<Id> }
  | { ok: false; reason: Refusal | "no-book" }

export interface Actions {
  // アクションを行い、結果を状態に入れる（ビルトインプラグインのアクションも追加プラグインのアクションも、画面と AI から同じ入口を通る）。
  // ブックが変われば、そのブックを開いている全部のステージを合わせ、一覧が変われば、無くなったブックを開いていたステージは何も開かない
  perform<Id extends ActionId>(id: Id, ...args: PerformArgs<Id>): Performed<Id>
  // そのステージから呼んだコマンドを行う。出ていない・押せないコマンドは行わず、行ったか返す
  command<Id extends CommandId>(stage: string, id: Id, ...args: CommandArgs<Id>): boolean
  // そのステージから開くダイアログを出す（出ていたものは閉じる）。値を渡すダイアログには、その値を渡す
  openDialog<Id extends DialogId>(stage: string, id: Id, ...args: DialogArgs<Id>): void
  closeDialog(): void
  // 開いているダイアログの下書きを置く（null で消す）。ダイアログを閉じると下書きも消える
  previewDialog(preview: DialogPreview | null): void
  submitDialog(): void // 開いているダイアログに、決めるように頼む（枠が中身の form を送る）
  // 押したキー（そろえた書き方）を、開いているメニュー・ダイアログ・カレントのステージの範囲で引き、当たったコマンドを行う。
  // 当たった範囲より外は見ない（当たったコマンドが押せなくても）。scopes は押した所の要素が名乗ったプラグインの範囲。行ったか返す
  pressKey(key: string, scopes?: readonly string[]): boolean
  // そのステージで右クリックされた物 target のメニュー id を、画面の座標 at に出す（出ていたものは閉じる）
  openContextMenu(stage: string, id: string, target: unknown, at: Point): void
  closeContextMenu(): void
  showToast(toast: Omit<Toast, "id">): string // トーストを出し、その id を返す
  dismissToast(id: string): void // トーストを消す（もう無ければ何もしない）
  split(stage: string): void // そのステージをカレントにして、右に何も開いていないステージを足す
  unsplit(stage: string): void // そのステージだけを残す
  moveDivider(x: number, width: number): void // 分けている境目を、並べた幅 width の左から x の所へ（ドラッグした位置）
  evenDivider(): void // 分けている境目を真ん中に戻す
  closeStage(id: string): void // 分けたステージの 1 つを閉じ、残りで画面を使う
  focusStage(id: string): void
  openBook(stage: string, book: string): void // そのステージでブックを開き（図面は最初のページ）、カレントにする
  openPage(stage: string, page: string): void // そのステージで開いているブックのページを開き、カレントにする
  resizeStage(id: string, view: Size): void // 表示領域の大きさが変わった
  panStageBy(id: string, dx: number, dy: number): void
  // そのステージの倍率を zoom にする（表示領域の中の点 at、無ければ真ん中の下の紙の点は動かさない）
  zoomStage(id: string, zoom: number, at?: Point): void
  resetStageView(id: string): void // そのステージを、開いたときの見え方（倍率 1・最初の位置）に戻す
  // そのステージが使う道具の組の道具を替える（同じ組を使うステージが全部替わり、置こうとしていたアイテムは取り消す）
  setTool(stage: string, tool: ToolId): void
  togglePlacing(stage: string, item: ItemId): void // そのステージでアイテムを置こうとする（同じものなら取り消す）
  stopPlacing(stage: string): void
  select(stage: string, ids: readonly string[]): void // そのステージで選ぶ物（開いているページのもの）
  setEditing(stage: string, editing: boolean): void // そのステージで選んでいる物を、その場で編集し始める・終える
  // そのステージで道具のアイコンを、画面の座標 at（null なら画面が決める所）に開く（ほかのステージで開いていたものは閉じる）
  openPicker(stage: string, at: Point | null): void
  closePicker(): void
  showPickerMap(stage: string): void // そのステージで開いている道具のアイコンを、ミニマップに替える
  setMinimap(stage: string, open: boolean): void // そのステージの左下のミニマップを開く・閉じる（紙が収まっていれば開かない）
}

// 画面で行ったアクション 1 つ（ホストが常駐に送り、行い直しに使う）。ids は行ったときに振った id の順、lang はそのときの言語
export interface DoneAction {
  action: string
  args: unknown
  on?: { book: string }
  ids: readonly string[]
  lang: Lang
  now: string // 行った時点（ActionContext の now）
}

export type ReadonlyStore = Pick<StoreApi<MatomezuState>, "getState" | "getInitialState" | "subscribe">

// インスタンス: 組み立てたもの（機能台帳と、組み立てで決まる値）と、状態と操作。plugins は、台帳のもとにしたプラグイン（画面の側が見た目を引く）
export interface MatomezuInstance<Ps extends readonly Plugin[] = readonly Plugin[]> extends Assembled {
  plugins: Ps
  state: ReadonlyStore
  actions: Actions
  // 外で決まったブックと設定（常駐が知らせたもの）に入れ替え、まだ確かめられていない自分のアクション replay をその上で行い直す。
  // 形に合わないブックは使わない。行い直しは observe に知らせず、断られたものは飛ばす。
  // ホストクライアントだけが使う（アクションを通さずに世界を入れ替えるので、プラグインに渡す actions には入れない）
  receive(
    world: { books: readonly unknown[]; settings: unknown; touched?: Readonly<Record<string, string>> },
    replay: readonly DoneAction[],
  ): void
  // 画面の場所（開いているブック・ページ・倍率・ずらす量・分割）を address にする（core/address.ts の placeAt）。
  // ホストクライアントだけが使う（ブラウザの URL などの外から戻すとき。プラグインに渡す actions には入れない）
  locate(address: Address): void
  // 取り込んだ追加プラグイン added を足して組み直す（前に足したものと置き換える）。状態は作ったときの初めに戻し、残したブックを新しい台帳で読み直す。
  // 組み立てられない追加プラグイン（check が投げたものも）は外し、その id と error を返す
  use(
    added: readonly Plugin[],
    check?: (plugins: readonly Plugin[]) => void,
  ): { failed: { id: string; error: unknown }[] }
}

// 最初のブック（無ければホーム、それも無ければ何も開かない）を開いた状態。表にある 1 冊だけのタイプのブックはいつも持つ
function initialState(
  catalog: CoreCatalog,
  books: readonly Book[],
  settings: Settings,
  home: string | null,
  unreadable: readonly Warning[] = [],
  partial: readonly Warning[] = [],
): MatomezuState {
  const all = [...singleBooks(catalog), ...books]
  const first = books[0] ?? all.find(b => b.id === home) ?? null
  return {
    books: Object.fromEntries(all.map(b => [b.id, b])),
    unreadable,
    partial,
    workspace: newWorkspace(catalog, first),
    settings,
    dialog: null,
    contextMenu: null,
    toasts: [],
    touched: {},
  }
}

export interface StoreOptions<Ps extends readonly Plugin[] = readonly Plugin[]> {
  plugins: Ps
  home?: SingleBookTypeId // ホームのブック（1 冊だけのタイプ）。最初に開くブックと「ホームを開く」の行き先で、ブックの一覧のアクションを許すかはこのタイプが決める
  books?: readonly Book[] // 最初に持つブック（最初の 1 冊を開く）。無ければ持たず、ホームを開く
  autoSkin?: { light?: SkinId; dark?: SkinId } // 自動のスキン（OS の明暗に合わせる）で使うスキン。無ければ、表で最初に出てくるその明暗のスキン
  lang?: Lang | readonly string[] // 言語か、好む言語の並び（ブラウザの言語など）。インスタンスにある最初の言語を使い、無ければ英語
  savedBooks?: readonly unknown[] // 残しておいたブック（ホストが読んだもの）。このインスタンスのブックの形に合うものだけを、books のあとに持つ
  settings?: unknown // 残しておいた設定（ホストが読んだもの）。このインスタンスで使える項目だけ、lang より優先して使う
  initial?: MatomezuState // 最初の状態をそのまま渡す（books と lang より優先する）
  newId?: () => string // ブック・ページ・アイテムの id のもとを振る。無ければ、どの世界でも重ならない uuid
  now?: () => string // アクションを行う時点（UTC の ISO 8601）を決める。無ければ今の時刻
  observe?: (done: DoneAction) => void // アクションを行えたときに知らせる（行い直しは知らせない）
}

function startLang(catalog: CoreCatalog, lang: Lang | readonly string[] = []): Lang {
  return detectLang(typeof lang === "string" ? [lang] : lang, [...catalog.languages.keys()])
}

export function createMatomezuInstance<const Ps extends readonly Plugin[]>(
  options: StoreOptions<Ps>,
): MatomezuInstance<Ps> {
  const { plugins } = options
  let defs = assemble(plugins, options.home ?? null, options.autoSkin)
  let { home } = defs
  let catalog = defs.catalog.core
  const start: Settings = {
    lang: startLang(catalog, options.lang),
    skin: "auto",
    keys: NO_KEY_CHANGES,
    textColors: NO_TEXT_COLORS,
  }
  const saved = checkBooks(catalog, options.savedBooks ?? [])
  const initial =
    options.initial ??
    initialState(
      catalog,
      [...(options.books ?? []), ...saved.books],
      restoreSettings(catalog, start, options.settings),
      home,
      saved.warnings,
      saved.partial,
    )
  const newId = options.newId ?? (() => crypto.randomUUID())
  const clock = options.now ?? (() => new Date().toISOString())
  const store = createStore<MatomezuState>()(() => initial)
  const { getState, setState } = store
  const ctx = (): ActionContext => ({ catalog, home, lang: getState().settings.lang, newId, now: clock() })
  // 残した・知らされたブックを確かめた値（読めたブックか、読めない warning。同じ値は確かめ直さない）
  let checked = new WeakMap<object, { book: Book; partial?: Warning } | { warning: Warning }>()
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
        const [part] = done.partial
        hit = book ? { book, ...(part ? { partial: part } : {}) } : warning ? { warning } : undefined
        if (!hit) continue
        checked.set(b, hit)
      }
      if ("book" in hit) {
        books.push(hit.book)
        if (hit.partial) partial.push(hit.partial)
      } else warnings.push(hit.warning)
    }
    return { books, warnings, partial }
  }
  // キーの割り当ての表（利用者の変更が変わったときだけ作り直す）
  let keyCache: { changes: KeyChanges; table: KeyTable } | null = null
  const keysFor = (changes: KeyChanges): KeyTable => {
    if (keyCache?.changes !== changes)
      keyCache = { changes, table: keyTable([...defs.catalog.store.keys.values()], changes) }
    return keyCache.table
  }
  const withWorkspace = (change: (ws: Workspace) => Workspace) => {
    const { workspace: ws } = getState()
    const next = change(ws)
    if (next !== ws) commit({ workspace: next })
  }
  // アクションを行い、入れる状態の差分を返す（入れるのは呼んだ側。ほかの変更と一度に入れられるように）
  const run = (
    id: string,
    args: unknown,
    on?: { book: string },
  ): { ok: true; result: unknown; next: Partial<MatomezuState> } | { ok: false; reason: Refusal | "no-book" } => {
    const { books, workspace, settings } = getState()
    const ids: string[] = []
    const c = ctx()
    const done = performIn({ books, settings }, id, args, on, {
      ...c,
      newId: () => {
        const made = c.newId()
        ids.push(made)
        return made
      },
    })
    if (!done.ok) return done
    options.observe?.({ action: id, args, ...(on ? { on } : {}), ids, lang: c.lang, now: c.now })
    const next: Partial<MatomezuState> = {}
    if (done.book) {
      next.books = { ...books, [done.book.id]: done.book }
      next.workspace = followBook(catalog, workspace, done.book, books[done.book.id])
    }
    if (done.books) {
      next.books = done.books as MatomezuState["books"]
      next.workspace = followLibrary(catalog, workspace, done.books as MatomezuState["books"], books)
    }
    if (done.settings) next.settings = done.settings
    return { ok: true, result: done.result, next }
  }
  // 状態の差分を入れる（何も変わらなければ知らせない）。開いたステージが無くなったダイアログと右クリックのメニューは閉じる
  const commit = (next: Partial<MatomezuState>) => {
    if (Object.keys(next).length === 0) return
    const { dialog, contextMenu } = getState()
    const stages = next.workspace?.stages
    const gone = (opened: { stage: string } | null) =>
      stages !== undefined && opened !== null && !stages.some(s => s.id === opened.stage)
    setState({
      ...next,
      ...(gone(dialog) ? { dialog: null } : {}),
      ...(gone(contextMenu) ? { contextMenu: null } : {}),
    })
  }
  let toasts = 0 // トーストの id の番号（出すたびに 1 つ進める）
  const actions: Actions = {
    perform: (id, ...[args, on]) => {
      const done = run(id, args, on)
      if (!done.ok) return done
      commit(done.next)
      return { ok: true, result: done.result } as Performed<typeof id>
    },
    command: (stage, id, ...args) => {
      const state = getState()
      const def = commandDef(defs, id)
      const ctx = commandContext(catalog, home, state, stage)
      if (!ctx || !isEnabled(defs, state, stage, id)) return false
      def.run(ctx, actions, args[0] as never)
      return true
    },
    openDialog: (stage, id, ...args) => {
      if (!defs.catalog.store.dialogs.has(id)) fail("E108", { id })
      if (getState().workspace.stages.some(s => s.id === stage))
        setState({ dialog: { id, stage, args: args[0], submitted: 0, preview: null } })
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
    pressKey: (key, scopes) => {
      const { contextMenu, dialog, workspace, settings } = getState()
      const table = keysFor(settings.keys)
      const picker = workspace.stages.find(s => s.picker !== null)?.id
      const stage = contextMenu?.stage ?? picker ?? dialog?.stage ?? workspace.current
      const menu = contextMenu !== null || picker !== undefined
      const type = workspace.stages.find(s => s.id === stage)?.opened?.type
      const presentation = type && catalog.bookTypes.get(type)?.presentation
      const shown = presentation ? catalog.presentations.get(presentation)?.keyScope : undefined
      for (const scope of keyScopes({ menu, dialog: dialog !== null }, scopes, shown)) {
        const hit = findKey(table, scope, key)
        if (!hit) continue
        const { command, args } = hit.binding
        const call = actions.command as (stage: string, id: string, ...args: unknown[]) => boolean
        return call(stage, command, ...(args === undefined ? [] : [args]))
      }
      return false
    },
    openContextMenu: (stage, id, target, at) => {
      if (getState().workspace.stages.some(s => s.id === stage)) setState({ contextMenu: { id, stage, target, at } })
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
    // 無いステージ（閉じたステージなど）への分割は、カレントへの分割にしない
    split: stage => withWorkspace(ws => (hasStage(ws, stage) ? split(focus(ws, stage)) : ws)),
    unsplit: stage => withWorkspace(ws => (hasStage(ws, stage) ? unsplit(focus(ws, stage)) : ws)),
    moveDivider: (x, width) => withWorkspace(ws => moveDivider(ws, x, width)),
    evenDivider: () => withWorkspace(evenDivider),
    closeStage: id => withWorkspace(ws => close(ws, id)),
    focusStage: id => withWorkspace(ws => focus(ws, id)),
    openBook: (stage, bookId) => {
      const book = getState().books[bookId]
      if (book) withWorkspace(ws => mapStage(focus(ws, stage), stage, s => openBook(catalog, s, book)))
    },
    openPage: (stage, page) => {
      const { books, workspace } = getState()
      const book = books[workspace.stages.find(s => s.id === stage)?.opened?.book ?? ""]
      if (book && hasPages(book)) withWorkspace(ws => showPage(catalog, focus(ws, stage), stage, book, page))
    },
    resizeStage: (id, view) => withWorkspace(ws => mapStage(ws, id, s => resize(s, view))),
    panStageBy: (id, dx, dy) => withWorkspace(ws => mapStage(ws, id, s => panBy(s, dx, dy))),
    zoomStage: (id, zoom, at) => withWorkspace(ws => mapStage(ws, id, s => zoomTo(s, zoom, at))),
    resetStageView: id => withWorkspace(ws => mapStage(ws, id, resetView)),
    setTool: (id, tool) => withWorkspace(ws => setTool(catalog, ws, id, tool)),
    togglePlacing: (id, item) => withWorkspace(ws => togglePlacing(catalog, ws, id, item)),
    stopPlacing: id => withWorkspace(ws => mapStage(ws, id, s => stopPlacing(s))),
    select: (id, ids) => withWorkspace(ws => mapStage(ws, id, s => select(s, ids))),
    setEditing: (id, editing) => withWorkspace(ws => mapStage(ws, id, s => setEditing(s, editing))),
    openPicker: (id, at) =>
      withWorkspace(ws => {
        const closed = ws.stages.reduce((w, s) => mapStage(w, s.id, closePicker), ws)
        return mapStage(closed, id, s => openPicker(s, at))
      }),
    closePicker: () => withWorkspace(ws => ws.stages.reduce((w, s) => mapStage(w, s.id, closePicker), ws)),
    showPickerMap: id => withWorkspace(ws => mapStage(ws, id, showPickerMap)),
    setMinimap: (id, open) => withWorkspace(ws => mapStage(ws, id, s => setMinimap(s, open))),
  }
  const instance: MatomezuInstance<Ps> = {
    ...defs,
    plugins,
    state: store,
    actions,
    receive: (world, replay) => {
      const found = restore(world.books)
      let books: MatomezuState["books"] = Object.fromEntries(
        [...singleBooks(catalog), ...found.books].map(b => [b.id, b]),
      )
      let settings = restoreSettings(catalog, start, world.settings)
      for (const done of replay) {
        const ids = [...done.ids]
        const next = performIn({ books, settings }, done.action, done.args, done.on, {
          catalog,
          home,
          lang: done.lang,
          newId: () => ids.shift() ?? newId(),
          now: done.now,
        })
        if (!next.ok) continue
        if (next.book) books = { ...books, [next.book.id]: next.book }
        if (next.books) books = next.books as MatomezuState["books"]
        if (next.settings) settings = next.settings
      }
      const now = getState()
      // 中身の同じブック・設定は前の値を使う（描き直しと、保存の知らせを減らす）
      for (const [id, b] of Object.entries(books)) {
        const old = now.books[id]
        if (old && old !== b && JSON.stringify(old) === JSON.stringify(b)) books = { ...books, [id]: old }
      }
      if (JSON.stringify(settings) === JSON.stringify(now.settings)) settings = now.settings
      const same =
        Object.keys(books).length === Object.keys(now.books).length &&
        Object.entries(books).every(([id, b]) => now.books[id] === b)
      const unreadable =
        JSON.stringify(found.warnings) === JSON.stringify(now.unreadable) ? now.unreadable : found.warnings
      const partial = JSON.stringify(found.partial) === JSON.stringify(now.partial) ? now.partial : found.partial
      const touched =
        world.touched === undefined || JSON.stringify(world.touched) === JSON.stringify(now.touched)
          ? now.touched
          : world.touched
      commit({
        ...(touched === now.touched ? {} : { touched }),
        ...(same ? {} : { books, workspace: followLibrary(catalog, now.workspace, books, now.books) }),
        ...(settings === now.settings ? {} : { settings }),
        ...(unreadable === now.unreadable ? {} : { unreadable }),
        ...(partial === now.partial ? {} : { partial }),
      })
    },
    locate: address => {
      const now = getState()
      if (JSON.stringify(addressOf(now.workspace)) === JSON.stringify(address)) return
      const workspace = placeAt(catalog, now.books, now.workspace, address)
      if (workspace !== now.workspace) commit({ workspace })
    },
    use: (added, check) => {
      const failed: { id: string; error: unknown }[] = []
      let used: Plugin[] = []
      let next = assemble(plugins, options.home ?? null, options.autoSkin)
      for (const p of added) {
        try {
          const all = [...plugins, ...used, p]
          const tried = assemble(all, options.home ?? null, options.autoSkin)
          check?.(all)
          used = [...used, p]
          next = tried
        } catch (error) {
          failed.push({ id: p.id, error })
        }
      }
      defs = next
      home = next.home
      catalog = next.catalog.core
      checked = new WeakMap()
      keyCache = null
      Object.assign(instance, next, { plugins: [...plugins, ...used] })
      const { settings } = getState()
      const again = checkBooks(catalog, options.savedBooks ?? [])
      setState(
        initialState(
          catalog,
          [...(options.books ?? []), ...again.books],
          settings,
          home,
          again.warnings,
          again.partial,
        ),
        true,
      )
      return { failed }
    },
  }
  return instance
}
