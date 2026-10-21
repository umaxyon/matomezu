// 画面の状態の store（1 つ）。状態を変えるのは、ここの名前付きの操作だけ。
// 画面には読む口（state）と操作（actions）だけを渡し、setState は渡さない。計算は core の純粋な関数に任せる

import { createStore, type StoreApi } from "zustand/vanilla"
import { hasPages, singleBooks } from "../core/book"
import type { ActionContext, ActionTarget } from "../core/def/action"
import { fail } from "../core/errors"
import type { Point, Size } from "../core/geom"
import { detectLang, type Lang } from "../core/i18n/i18n"
import { type ArgsOf, perform, type Refusal, type ResultOf, type TargetOf } from "../core/perform"
import type { Registry } from "../core/registry"
import type { Book } from "../core/schema/book"
import type { Settings } from "../core/settings"
import { openBook, panBy, resize, select, setTool, stopPlacing, type Tool, togglePlacing } from "../core/stage"
import type { ActionId, ItemId, SingleBookTypeId, SkinId } from "../core/tables"
import {
  close,
  focus,
  followBook,
  followLibrary,
  hasStage,
  mapStage,
  newWorkspace,
  showPage,
  split,
  unsplit,
  type Workspace,
} from "../core/workspace"
import { type CommandArgs, type CommandId, commandContext, commandDef, isEnabled } from "./commands"
import type { OpenedContextMenu } from "./context-menus"
import type { DialogArgs, OpenedDialog } from "./dialogs"
import { type AppDefs, assemble, type Plugin } from "./plugin"
import type { DialogId } from "./tables"

export type { Settings } from "../core/settings"

export interface AppState {
  books: Record<string, Book> // ブックの id ごと
  workspace: Workspace
  settings: Settings
  dialog: OpenedDialog | null
  contextMenu: OpenedContextMenu | null
}

// アクションの宛先。ブックが対象のアクションは、どのブックかを渡す（一覧と設定は 1 つしかないので渡さない）
export type PerformArgs<Id extends ActionId> =
  TargetOf<Id> extends "book" ? [args: ArgsOf<Id>, on: { book: string }] : [args: ArgsOf<Id>]
// 行ったアクションの結果。no-book は宛先のブックが無いとき
export type Performed<Id extends ActionId> =
  | { ok: true; result: ResultOf<Id> }
  | { ok: false; reason: Refusal | "no-book" }

export interface Actions {
  // アクションを行い、結果を状態に入れる（中の部品のアクションもプラグインのアクションも、画面と AI から同じ入口を通る）。
  // ブックが変われば、そのブックを開いている全部のステージを合わせ、一覧が変われば、無くなったブックを開いていたステージは何も開かない
  perform<Id extends ActionId>(id: Id, ...args: PerformArgs<Id>): Performed<Id>
  // そのステージから呼んだコマンドを行う。出ていない・押せないコマンドは行わず、行ったか返す
  command<Id extends CommandId>(stage: string, id: Id, ...args: CommandArgs<Id>): boolean
  // そのステージから開くダイアログを出す（出ていたものは閉じる）。値を渡すダイアログには、その値を渡す
  openDialog<Id extends DialogId>(stage: string, id: Id, ...args: DialogArgs<Id>): void
  closeDialog(): void
  // そのステージで右クリックされた物 target のメニュー id を、画面の座標 at に出す（出ていたものは閉じる）
  openContextMenu(stage: string, id: string, target: unknown, at: Point): void
  closeContextMenu(): void
  split(stage: string): void // そのステージをカレントにして、右に何も開いていないステージを足す
  unsplit(stage: string): void // そのステージだけを残す
  closeStage(id: string): void // 分けたステージの 1 つを閉じ、残りで画面を使う
  focusStage(id: string): void
  openBook(stage: string, book: string): void // そのステージでブックを開き（図面は最初のページ）、カレントにする
  openPage(stage: string, page: string): void // そのステージで開いているブックのページを開き、カレントにする
  // そのステージのブックにページを足して（アクション page.add）、そのステージで開き、カレントにする。足せたか返す
  addPage(stage: string, args: ArgsOf<"page.add">): boolean
  // ブックを作って（アクション book.create）、そのステージで開き、カレントにする。作れたか返す
  createBook(stage: string, args: ArgsOf<"book.create">): boolean
  // 設定を変える（アクション settings.lang・settings.skin）。ホームのタイプが許さなければ変えない。変えたか返す
  setLang(lang: Lang): boolean
  setSkin(skin: string): boolean
  resizeStage(id: string, view: Size): void // 表示領域の大きさが変わった
  panStageBy(id: string, dx: number, dy: number): void
  setTool(stage: string, tool: Tool): void // そのステージの道具を替える（置こうとしていたアイテムは取り消す）
  togglePlacing(stage: string, item: ItemId): void // そのステージでアイテムを置こうとする（同じものなら取り消す）
  stopPlacing(stage: string): void
  select(stage: string, ids: readonly string[]): void // そのステージで選ぶアイテム（開いているページのもの）
}

export type ReadonlyStore = Pick<StoreApi<AppState>, "getState" | "getInitialState" | "subscribe">

// AppDefs は、この store が使う定義の表（登録表・コマンド・ダイアログ・ホーム）。plugins は、表のもとにしたプラグイン（画面の側が見た目を引く）
export interface AppStore<Ps extends readonly Plugin[] = readonly Plugin[]> extends AppDefs {
  plugins: Ps
  state: ReadonlyStore
  actions: Actions
}

// 最初のブック（無ければホーム、それも無ければ何も開かない）を開いた状態。表にある 1 冊だけのタイプのブックはいつも持つ
function initialState(registry: Registry, books: readonly Book[], lang: Lang, home: string | null): AppState {
  const all = [...singleBooks(registry), ...books]
  const first = books[0] ?? all.find(b => b.id === home) ?? null
  return {
    books: Object.fromEntries(all.map(b => [b.id, b])),
    workspace: newWorkspace(registry, first),
    settings: { lang, skin: "auto" },
    dialog: null,
    contextMenu: null,
  }
}

export interface StoreOptions<Ps extends readonly Plugin[] = readonly Plugin[]> {
  plugins: Ps
  home?: SingleBookTypeId // ホームのブック（1 冊だけのタイプ）。最初に開くブックと「ホームを開く」の行き先で、ブックの一覧のアクションを許すかはこのタイプが決める
  books?: readonly Book[] // 最初に持つブック（最初の 1 冊を開く）。無ければ持たず、ホームを開く
  autoSkin?: { light?: SkinId; dark?: SkinId } // 自動のスキン（OS の明暗に合わせる）で使うスキン。無ければ、表で最初に出てくるその明暗のスキン
  lang?: Lang | readonly string[] // 言語か、好む言語の並び（ブラウザの言語など）。app にある最初の言語を使い、無ければ英語
  initial?: AppState // 最初の状態をそのまま渡す（books と lang より優先する）
  newId?: () => string // 作るブックの id を振る。無ければ、どの世界でも重ならない uuid
}

function startLang(registry: Registry, lang: Lang | readonly string[] = []): Lang {
  return detectLang(typeof lang === "string" ? [lang] : lang, [...registry.languages.keys()])
}

export function createAppStore<const Ps extends readonly Plugin[]>(options: StoreOptions<Ps>): AppStore<Ps> {
  const { plugins } = options
  const defs = assemble(plugins, options.home ?? null, options.autoSkin)
  const { registry, home } = defs
  const initial =
    options.initial ?? initialState(registry, options.books ?? [], startLang(registry, options.lang), home)
  const newId = options.newId ?? (() => crypto.randomUUID())
  const store = createStore<AppState>()(() => initial)
  const { getState, setState } = store
  const ctx = (): ActionContext => ({ registry, home, lang: getState().settings.lang, newId })
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
  ): { ok: true; result: unknown; next: Partial<AppState> } | { ok: false; reason: Refusal | "no-book" } => {
    const { books, workspace, settings } = getState()
    const target: ActionTarget | undefined = registry.actions.get(id)?.target
    const loose = perform as (
      subject: unknown,
      id: string,
      args: unknown,
      ctx: ActionContext,
    ) => ReturnType<typeof perform>
    if (target === "book") {
      const book = books[on?.book ?? ""]
      if (!book) return { ok: false, reason: "no-book" }
      const done = loose(book, id, args, ctx())
      if (!done.ok) return done
      const next = done.next as Book
      if (next.id !== book.id) return { ok: false, reason: "refused" }
      if (next === book) return { ok: true, result: done.result, next: {} }
      return {
        ok: true,
        result: done.result,
        next: { books: { ...books, [book.id]: next }, workspace: followBook(registry, workspace, next) },
      }
    }
    const subject = target === "library" ? books : settings
    const done = loose(subject, id, args, ctx())
    if (!done.ok) return done
    if (target === "library") {
      const next = done.next as AppState["books"]
      return {
        ok: true,
        result: done.result,
        next: { books: next, workspace: followLibrary(registry, workspace, next) },
      }
    }
    // 同じ値の設定なら知らせない
    const next = done.next as Settings
    const same = JSON.stringify(next) === JSON.stringify(settings)
    return { ok: true, result: done.result, next: same ? {} : { settings: next } }
  }
  // 状態の差分を入れる（何も変わらなければ知らせない）。開いたステージが無くなったダイアログと右クリックのメニューは閉じる
  const commit = (next: Partial<AppState>) => {
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
      const ctx = commandContext(registry, home, state, stage)
      if (!ctx || !isEnabled(defs, state, stage, id)) return false
      def.run(ctx, actions, args[0] as never)
      return true
    },
    openDialog: (stage, id, ...args) => {
      if (!defs.dialogs.has(id)) fail("E108", { id })
      if (getState().workspace.stages.some(s => s.id === stage)) setState({ dialog: { id, stage, args: args[0] } })
    },
    closeDialog: () => {
      if (getState().dialog) setState({ dialog: null })
    },
    openContextMenu: (stage, id, target, at) => {
      if (getState().workspace.stages.some(s => s.id === stage)) setState({ contextMenu: { id, stage, target, at } })
    },
    closeContextMenu: () => {
      if (getState().contextMenu) setState({ contextMenu: null })
    },
    // 無いステージ（閉じたステージなど）への分割は、カレントへの分割にしない
    split: stage => withWorkspace(ws => (hasStage(ws, stage) ? split(focus(ws, stage)) : ws)),
    unsplit: stage => withWorkspace(ws => (hasStage(ws, stage) ? unsplit(focus(ws, stage)) : ws)),
    closeStage: id => withWorkspace(ws => close(ws, id)),
    focusStage: id => withWorkspace(ws => focus(ws, id)),
    openBook: (stage, bookId) => {
      const book = getState().books[bookId]
      if (book) withWorkspace(ws => mapStage(focus(ws, stage), stage, s => openBook(registry, s, book)))
    },
    openPage: (stage, page) => {
      const { books, workspace } = getState()
      const book = books[workspace.stages.find(s => s.id === stage)?.opened?.book ?? ""]
      if (book && hasPages(book)) withWorkspace(ws => showPage(registry, focus(ws, stage), stage, book, page))
    },
    addPage: (stageId, args) => {
      const book = getState().workspace.stages.find(s => s.id === stageId)?.opened?.book
      const done = book ? run("page.add", args, { book }) : null
      if (!done?.ok) return false
      const next = done.next.books?.[book as string]
      const ws = done.next.workspace ?? getState().workspace
      if (!next || !hasPages(next)) return false
      const page = (done.result as ResultOf<"page.add">).page
      commit({ ...done.next, workspace: showPage(registry, focus(ws, stageId), stageId, next, page) })
      return true
    },
    createBook: (stageId, args) => {
      const done = run("book.create", args)
      if (!done.ok) return false
      const book = done.next.books?.[(done.result as ResultOf<"book.create">).book]
      const ws = done.next.workspace ?? getState().workspace
      if (!book) return false
      commit({ ...done.next, workspace: mapStage(focus(ws, stageId), stageId, s => openBook(registry, s, book)) })
      return true
    },
    setLang: lang => actions.perform("settings.lang", { lang }).ok,
    setSkin: skin => actions.perform("settings.skin", { skin }).ok,
    resizeStage: (id, view) => withWorkspace(ws => mapStage(ws, id, s => resize(s, view))),
    panStageBy: (id, dx, dy) => withWorkspace(ws => mapStage(ws, id, s => panBy(s, dx, dy))),
    setTool: (id, tool) => withWorkspace(ws => mapStage(ws, id, s => setTool(s, tool))),
    togglePlacing: (id, item) => withWorkspace(ws => mapStage(ws, id, s => togglePlacing(s, item))),
    stopPlacing: id => withWorkspace(ws => mapStage(ws, id, s => stopPlacing(s))),
    select: (id, ids) => withWorkspace(ws => mapStage(ws, id, s => select(s, ids))),
  }
  return { ...defs, plugins, state: store, actions }
}
