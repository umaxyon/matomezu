// 画面の状態の store（1 つ）。状態を変えるのは、ここの名前付きの操作だけ。
// 画面には読む口（state）と操作（actions）だけを渡し、setState は渡さない。計算は core の純粋な関数に任せる

import { createStore, type StoreApi } from "zustand/vanilla"
import { USER } from "../core/actor"
import { type Address, addressOf, keepPlace, placeAt } from "../core/address"
import { type Annotations, restoreAllAnnotations, withAnnotations } from "../core/annotation"
import { checkBooks, distinctBooks, findPage, pageById } from "../core/book"
import { bulkActionOf, performBulk } from "../core/bulk"
import type {
  ActionId,
  ControlCenterId,
  DialogId,
  ItemId,
  MessageKey,
  SkinId,
  SubjectId,
  ToolId,
} from "../core/catalog"
import type { CoreCatalog } from "../core/core-catalog"
import type { ActionContext, ActionOn, PageTarget } from "../core/def/action"
import type { PluginStateDef } from "../core/def/plugin-state"
import { fail } from "../core/errors"
import {
  changesBetween,
  type Folder,
  type Folders,
  homeAndFoldersOf,
  homeOver,
  libraryOf,
  type PageRow,
  type Pages,
  rawBooksOf,
  settledOn,
  type TableChanges,
  type Tables,
  tablesOf,
  withChanges,
  worldTablesOf,
} from "../core/folders"
import { deepFreeze } from "../core/freeze"
import type { Point, Size } from "../core/geom"
import {
  type BookHistory,
  changeSeen,
  HISTORY_LIMIT,
  type HistoryStep,
  insertStep,
  NO_HISTORY,
  type RowChange,
  type SeenTest,
} from "../core/history"
import { detectLang, type Lang, type Params } from "../core/i18n/i18n"
import { type Library, splitTrash } from "../core/library"
import { type Patch, patchOf, undoneIn, type Written } from "../core/patch"
import { type ArgsOf, performIn, type Refused, type ResultOf, type TargetOf } from "../core/perform"
import {
  type Counters,
  REMOVED,
  type Records,
  restoreCounters,
  restoreRecords,
  withCounters,
  withRecords,
} from "../core/records"
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
  type Stage,
  select,
  setArea,
  setEditing,
  setPreviewArea,
  setStart,
  shownPageId,
  shownType,
  startBackground,
  stopPlacing,
  toPaper,
  zoomTo,
} from "../core/stage"
import type { Warning } from "../core/warnings"
import { NO_WIDE_SEARCH_HITS, type WideSearchAnswer, type WideSearchQuery } from "../core/wide-search"
import {
  bookScreenCurrent,
  closeScreen,
  issueStage,
  makeCurrent,
  mapScreen,
  mapScreenOfStage,
  mapScreens,
  newWindow,
  openScreen,
  screenOf,
  screenOfStage,
  setArrangement,
  shownBookScreens,
  stageIn,
  type WindowState,
  withScreenProps,
} from "../core/window"
import {
  close,
  evenDivider,
  focus,
  followBook,
  followLibrary,
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
import { type CommandArgs, type CommandId, called, commandOwner, isEnabled } from "./commands"
import type { CommandActions } from "./commands/def"
import type { MenuOpens, OpenedContextMenu } from "./context-menus"
import { type DialogArgs, type DialogPreview, NO_STAGE, type OpenedDialog } from "./dialogs"
import { findKey, type KeyReach, type KeyTable, keyScopes, keyTable } from "./keys"
import { type Assembled, assemble, type Plugin } from "./plugin"
import {
  keptOutside,
  NO_PLUGIN_STATES,
  ownedPluginState,
  type PluginValues,
  placedOf,
  pluginValueOf,
  pushingIds,
  readPlaced,
  withPluginState,
} from "./plugin-state"
import { worldOf } from "./world"

export type { Settings } from "../core/settings"

// openScreen が開かなかったときに返す値
export const SCREEN_REFUSED = "refused"

export interface MatomezuState {
  // ページの表とフォルダの表（core/folders.ts。ゴミ箱のブックの分も）。ブックのデータは、この 2 つが持つ。books と trash は、ここから組んだ値で、表を変える所で一緒に入れ直す
  pages: Pages
  folders: Folders
  books: Readonly<Record<string, Book>> // ブックの id ごと（ゴミ箱のブックは除く。表から組んだ値）
  unreadable: readonly Warning[] // 残したブックのうち、ブックごと読めないもの（warning W005・W006。データには手を付けず、開けない）
  partial: readonly Warning[] // 読めるブックの、読めないページ（warning W027〜W029）と、機能台帳に無いアイテムや設定の項目（W007）。無い物はそのまま残す
  window: WindowState // 窓の、開いているスクリーンとカレントにした順・スクリーンアレンジメント（core/window.ts）
  settings: Settings
  annotations: Annotations // ページの id → そのページのアノテーション（core/annotation.ts。1 つも無いページは持たない）
  records: Records // 対象の定義が足した種類ごとのレコード（core/records.ts。種類の id → id → レコード）
  counters: Counters // 番号を振る種類ごとの、区切りごとの次の番号（core/records.ts）
  lang: Lang // 今の言語（設定の言語の項目が選んだ言語パックの言語。選んでいない・使えなければ、インスタンスを作ったときに決めた言語）
  dialog: OpenedDialog | null
  contextMenu: OpenedContextMenu | null
  toasts: readonly Toast[] // 出しているトースト（古い順）
  // ブックの id → 触れた（開いたか書いた）時刻（ISO 8601 の UTC）。ホストが知らせたもの（receive）で、無ければ空
  touched: Readonly<Record<string, string>>
  participantCalls: Readonly<Record<string, string>> // 参加者の id → 最後に呼ばれた時刻（常駐だけが持つ参加者の記録。ホストが知らせる。生きているかの判定に使う）
  participantReady: readonly string[] // 準備中でない参加者の id（常駐だけが持つ参加者の記録。ホストが知らせる。受け入れ済みの参加者の準備中を見分けるのに使う）
  // 参加者の id → AI のフックが知らせたモデルと、MCP が添えた git のブランチ（常駐だけが持つ参加者の記録。ホストが知らせる。どちらも無い参加者は持たない）
  participantLive: Readonly<Record<string, ParticipantLive>>
  trash: Readonly<Record<string, Book>> // ゴミ箱のブック（trashed のあるブック）の id ごと
  offline: boolean // 常駐とのつながりが、しばらく切れたままか（ホストクライアントが知らせる）
  lastWindow: boolean // この窓が、最後にフォーカスされた窓か（ホストクライアントが、常駐のレコードの知らせに添えられた値で入れる）
  // ブックの id → 画面の履歴（この画面で利用者が行ったアクションだけ。読み直すと消える）。画面の履歴の段がいくつかのブックを変えたら、その全部のブックに同じ画面の履歴の段が入る
  history: Readonly<Record<string, BookHistory>>
  // プラグイン状態の宣言（core/def/plugin-state.ts）の値: ステージに結ばない物は宣言の id → 値、ステージごとの物は ステージの id → 宣言の id → 値。画面の場所に入れる宣言の値は画面の場所に入る（アクションのデータとは別で、アクションでは変えない）
  pluginValues: PluginValues
  // 編集ロック: 掛けた所の鍵 → 利用者が直している物（ブックの id と物の id）。ホストクライアントが常駐に知らせ、常駐はそれを変える AI のアクションを断る
  editLocks: Readonly<Record<string, EditLock>>
  // 印刷を頼んだ回数（requestPrint で増える。ホストクライアントが、増えたら画面を刷る）
  printRequests: number
  // ブラウザの履歴を 1 つ戻してほしいと頼んだ回数（requestBack で増える。ホストクライアントが、増えたら戻す）と、この窓の中に戻る先があるか（ホストクライアントが入れる）
  backRequests: number
  canGoBack: boolean
  // 窓の変わりをブラウザの履歴に積まずに書き換えてほしいと頼んだ回数（replaceHistory で増える。ホストクライアントが、
  // 増えたら、その同期の処理の中の変わりをまとめて書き換える）
  historyReplaces: number
}

// 参加者 1 人の様子: AI のフックが知らせたモデルと、MCP が添えた git のブランチ（知らされていない物は持たない）
export interface ParticipantLive {
  readonly model?: string
  readonly branch?: string
}

// 編集ロックの 1 つ: within（ページの id か、ブックの id）の中の物 ids（ページなら、アイテムなどとそのページのアノテーションとページそのもの。ブックなら、バインダとブックそのもの）か、対象の種類 subject のレコード ids
export type EditLock = { within: string; ids: readonly string[] } | { subject: string; ids: readonly string[] }

// トースト: 画面に出して、しばらくすると消える知らせ。info は普通の知らせ、success はうまくいったことを知らせ、warn は断りを知らせ、error は失敗を知らせて直るまで出しておく
// （時間では消えず、出した側か利用者が消す）。文言は鍵で持ち、画面が今の言語で出す。何が起きたかを message に、原因を detail に分けて書ける。
// form は見せ方: card はふつうのトースト、marquee は上から下りて文を横に流し、流し終えたら引っ込む知らせ（info と success だけ。無ければ card）
// 出すトースト（id は store が振る。形ごとに id を除く）
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never
export type ToastInput = WithoutId<Toast>
export type Toast = ToastBody &
  ({ kind: "info" | "success" | "warn" | "error"; form?: "card" } | { kind: "info" | "success"; form: "marquee" })
interface ToastBody {
  id: string
  message: MessageKey
  params?: Params
  detail?: { message: MessageKey; params?: Params } // 2 行目に出す文言（断った原因など）
}

// アクションの宛先。ブックが対象のアクションは、どのブックかを渡し、ページとページのアノテーションが対象のアクションは、どのページかを渡す（一覧と設定は 1 つしかないので渡さない）
// （対象の定義が足した種類のアクションは、直す・消すなら 1 件を指し、作るなら指さない）
export type PerformArgs<Id extends ActionId> =
  TargetOf<Id> extends "book"
    ? [args: ArgsOf<Id>, on: { book: string }]
    : TargetOf<Id> extends PageTarget
      ? [args: ArgsOf<Id>, on: { page: string }]
      : TargetOf<Id> extends SubjectId
        ? [args: ArgsOf<Id>, on?: { record: string }]
        : [args: ArgsOf<Id>]
// 行ったアクションの結果。no-book は宛先のブックが無いとき、denied は認可ステップが止めたとき（permission はそのステップの id）、
// print-preview は印刷プレビューの間のステージから行おうとしたとき（ui の usePerform。core/stage.ts の stageBlocks）
export type Performed<Id extends ActionId> =
  | { ok: true; result: ResultOf<Id> }
  | Refused
  | { ok: false; reason: "no-book" | "no-record" | "print-preview" }

// ホストが断った（reason はホストの断りの理由）
export interface HostRefused {
  ok: false
  reason: string
  by: "host"
}

// 画面の操作のうち、窓に向ける物（呼ぶ場所によらない）
export interface WindowActions {
  // アクションを行い、結果を状態に入れる（ビルトインプラグインのアクションも追加プラグインのアクションも、画面と AI から同じ入口を通る）。
  // ブックが変われば、そのブックを開いている全部のステージを合わせ、一覧が変われば、無くなったブックを開いていたステージは何も開かない
  perform<Id extends ActionId>(id: Id, ...args: PerformArgs<Id>): Performed<Id>
  // perform と同じく行い、ホストが確かめた答えを待って返す（ホストが断ったら、その reason。ホストが無ければ行った結果をそのまま返す）。
  // ほかの窓だけが知る事（ほかの窓の編集ロックなど）で断られたことを、利用者に知らせたいときに使う
  performConfirmed<Id extends ActionId>(id: Id, ...args: PerformArgs<Id>): Promise<Performed<Id> | HostRefused>
  closeDialog(): void
  // 開いているダイアログの下書きを置く（null で消す）。ダイアログを閉じると下書きも消える
  previewDialog(preview: DialogPreview | null): void
  submitDialog(): void // 開いているダイアログに、決めるように頼む（枠が中身の form を送る）
  // 押したキー（そろえた書き方）を、開いているメニュー・ダイアログ・カレントのステージの範囲で引き、当たったコマンドを行う。
  // 範囲は狭い方から順に引き、その場で使えるコマンドに当たった所で行う（使えないキーバインドは無いものとして、次の範囲の同じキーを探す）。scopes は押した所の要素が名乗ったプラグインの範囲。
  // reach が "named" なら scopes だけを引く（テキストFormが自分で名乗った範囲）。行ったか返す
  pressKey(key: string, scopes?: readonly string[], reach?: KeyReach): boolean
  closeContextMenu(): void
  showToast(toast: ToastInput): string // トーストを出し、その id を返す
  dismissToast(id: string): void // トーストを消す（もう無ければ何もしない）
  // スクリーンを 1 枚開いてカレントにし、開いた 1 枚の id を返す。def はスクリーンの定義の id、props は渡す値（定義の props の形）。
  // 機能台帳に無い定義・形に合わない値なら開かず、refused を返す
  openScreen(def: string, props: unknown): string
  // 開いているスクリーン id に渡す値を props に替える（スクリーンを積まず、ブラウザの履歴には積む。値は、そのスクリーンの定義の props の形。無いスクリーン・形に合わない値なら替えず false）
  setScreenProps(id: string, props: unknown): boolean
  makeScreenCurrent(id: string): void // 開いているスクリーン id をカレントスクリーンにする（見せるかはスクリーンアレンジメントが決める。退いた物の中は残す）
  // 開いているスクリーン id を閉じる（カレントスクリーンだったなら、1 つ前にカレントだった物がカレントになる）。最初から開いているスクリーンと、最後の 1 枚のブックスクリーンは閉じない
  closeScreen(id: string): void
  // スクリーンアレンジメントを定義 def と値 value に替える（値を渡さなければ、定義の初めの値。機能台帳に無い定義・値が定義の形に合わなければ替えない）
  setScreenArrangement(def: string, value?: unknown): void
  // 同じ同期の処理の中の窓の変わりを、ブラウザの履歴に積まずに書き換えてほしいと頼む（利用者の操作でない変わり。窓の大きさでスクリーンアレンジメントを戻すなど）
  replaceHistory(): void
  showStage(id: string): void // ステージ id をカレントにし、それを並べているスクリーンをカレントスクリーンにする（そのステージを見せる）
  moveDivider(x: number, width: number): void // 分けている境目を、並べた幅 width の左から x の所へ（ドラッグした位置）
  evenDivider(): void // 分けている境目を真ん中に戻す
  requestPrint(): void // 画面を刷ってほしいと頼む（刷るのはホストクライアント。刷る物は画面が印刷のときだけ出す）
  requestBack(): void // ブラウザの履歴を 1 つ戻してほしいと頼む（戻すのはホストクライアント。戻る先が無い canGoBack が false のときは、頼んでも何も起きない）
  closePicker(): void
  // ブック book の画面の履歴の、戻せる（from が undo）かやり直せる（redo）最後の画面の履歴の段を、反対の側へ移す。それが変えたほかのブックの画面の履歴でも移す。
  // 画面の履歴の段を戻す・やり直すアクションを行えたあとに呼ぶ
  moveHistory(book: string, from: "undo" | "redo"): void
  // 同じ処理の中でこのあと行うアクションを、ブック book の最後の画面の履歴の段に足す（足して始めたその場の編集を確定するとき。足すのと書くのを 1 つの画面の履歴の段にする）。
  // 足すのは、そのブックに最後に入れた画面の履歴の段が、そのブックの最後の物のときだけ（元に戻す・やり直すのあとは足さずに、別の画面の履歴の段になる）。
  // 足したあと何も変わらなければ（足した物を書かずに消したなど）、その画面の履歴の段ごと無くなる
  continueStep(book: string): void
}

// 画面の操作のうち、場所（ステージの id。ダイアログとコマンドは、ステージを持たないスクリーンの id も）に向ける物。どれも第 1 引数が向ける場所。
// プラグインの見た目とコマンドには、描いている場所・呼ばれた場所に向けた形（BoundPlaceActions。第 1 引数が無い）で渡す
export interface PlaceActions {
  // そのステージから呼んだコマンドを行う。出ていない・押せないコマンドは行わず、行ったか返す
  command<Id extends CommandId>(stage: string, id: Id, ...args: CommandArgs<Id>): boolean
  // そのステージから開くダイアログを出す（出ていたものは閉じる）。値を渡すダイアログには、その値を渡す
  // ダイアログを開く。at は、開く場所: ステージの id か、開いているスクリーンの id（ステージを持たないスクリーンから開くとき）。どちらでもなければ開かない
  openDialog<Id extends DialogId>(at: string, id: Id, ...args: DialogArgs<Id>): void
  // そのステージで右クリックされた物 target のメニュー id を、画面の座標 at に出す（出ていたものは閉じる）
  openContextMenu(stage: string, id: string, target: unknown, at: Point, opens?: MenuOpens): void
  split(stage: string): void // そのステージをカレントにして、右に何も開いていないステージを足す
  unsplit(stage: string): void // そのステージだけを残す
  closeStage(id: string): void // 分けたステージの 1 つを閉じ、残りで画面を使う
  focusStage(id: string): void
  openBook(stage: string, book: string): void // そのステージでブックを開き（ページがあれば最初のページ）、カレントにする
  openPage(stage: string, page: string): void // そのステージで開いているブックのページを開き、カレントにして、そのブックスクリーンをカレントスクリーンにする
  openBinder(stage: string, binder: string): void // そのステージで開いているブックのバインダを開く（中の最初のページ。空ならバインダ）
  openPageById(stage: string, page: string): void // ページ page を持つブックをそのステージで開き、そのページを開く（ページが無ければ何もしない）
  resizeStage(id: string, view: Size): void // 表示領域の大きさが変わった
  // プレゼンテーションが描く広さ（可変ページ。null なら紙 1 枚）と、描く中身を右・下へずらした量（印刷区画の数。位置をデータに持たないプレゼンテーション）
  setStageArea(id: string, area: Size | null, origin?: Point | null): void
  // 初めの位置で表示領域の左上に置く紙の点（中身の載った印刷区画の左上。開いたばかりなら、そこへ合わせる）
  setStageStart(id: string, start: Point): void
  panStageBy(id: string, dx: number, dy: number): void
  // そのステージの倍率を zoom にする（表示領域の中の点 at、無ければ真ん中の下の紙の点は動かさない）
  zoomStage(id: string, zoom: number, at?: Point): void
  resetStageView(id: string): void // そのステージを、開いたときの見え方（倍率 1・初めの位置）に戻す
  // そのステージで印刷プレビューを開く・閉じる（閉じたら開く前の倍率とずらす量に戻す）
  openPrintPreview(id: string): void
  closePrintPreview(id: string): void
  startBackground(id: string): void // そのステージを背景編集モードにする（背景を持つタイプのブックのページを開いている編集の間だけ）
  endBackground(id: string): void // そのステージの背景編集モードを終える
  setPreviewArea(id: string, area: Size): void // 印刷プレビューで並べた広さ（プレゼンテーションが知らせる）
  // そのステージが使う道具の組の道具を替える（同じ組を使うステージが全部替わり、置こうとしていたアイテムは取り消す）
  setTool(stage: string, tool: ToolId): void
  // そのステージでアイテムを置こうとする（同じものなら取り消す）。props は置くときに渡す項目の値（無ければアイテムの既定）
  togglePlacing(stage: string, item: ItemId, props?: Readonly<Record<string, unknown>>): void
  stopPlacing(stage: string): void
  select(stage: string, ids: readonly string[]): void // そのステージで選ぶ物（開いているページのもの）
  // そのステージで選んでいる物を、その場で編集し始める・終える（何をするかを名前で分けるときは、その名前で始める）
  setEditing(stage: string, editing: boolean | string): void
  // そのステージで道具のアイコンを、画面の座標 at（null なら画面が決める所）に開く（ほかのステージで開いていたものは閉じる）
  openPicker(stage: string, at: Point | null): void
}

// 場所に向ける操作 A の、場所を決めた形（第 1 引数を外した物）
type Bound<A> = { [K in keyof A]: A[K] extends (at: string, ...rest: infer R) => infer T ? (...rest: R) => T : never }

// 場所に向ける操作を、決まった場所（描いている場所・呼ばれた場所）に向けた形。向ける場所が無ければ、何もしない
export interface BoundPlaceActions extends Omit<Bound<PlaceActions>, "command" | "openDialog"> {
  command<Id extends CommandId>(id: Id, ...args: CommandArgs<Id>): boolean
  openDialog<Id extends DialogId>(id: Id, ...args: DialogArgs<Id>): void
}

// 場所に向ける操作の名前（PlaceActions に操作を足したら、ここにも書く。書き忘れは型の誤り）
export const PLACE_ACTIONS: { readonly [K in keyof PlaceActions]: true } = {
  command: true,
  openDialog: true,
  openContextMenu: true,
  split: true,
  unsplit: true,
  closeStage: true,
  focusStage: true,
  openBook: true,
  openPage: true,
  openBinder: true,
  openPageById: true,
  resizeStage: true,
  setStageArea: true,
  setStageStart: true,
  panStageBy: true,
  zoomStage: true,
  resetStageView: true,
  openPrintPreview: true,
  closePrintPreview: true,
  startBackground: true,
  endBackground: true,
  setPreviewArea: true,
  setTool: true,
  togglePlacing: true,
  stopPlacing: true,
  select: true,
  setEditing: true,
  openPicker: true,
}

// 操作 actions の、場所に向ける物を、場所 at（null なら向ける場所が無い: 何もしない）に向けた形
export function boundActions(actions: PlaceActions, at: string | null): BoundPlaceActions {
  const loose = actions as unknown as Record<string, (at: string, ...rest: unknown[]) => unknown>
  return Object.fromEntries(
    Object.keys(PLACE_ACTIONS).map(k => [
      k,
      (...rest: unknown[]) => (at === null ? (k === "command" ? false : undefined) : loose[k]?.(at, ...rest)),
    ]),
  ) as unknown as BoundPlaceActions
}

// 何も行わない、窓に向ける操作（操作を向ける先が無い所で使う。アクションは no-book で断り、id を返す操作は空の文字を返す）
const NOTHING = () => {}
export const REFUSED_WINDOW_ACTIONS: WindowActions = {
  perform: () => ({ ok: false, reason: "no-book" }),
  performConfirmed: async () => ({ ok: false, reason: "no-book" }),
  closeDialog: NOTHING,
  previewDialog: NOTHING,
  submitDialog: NOTHING,
  pressKey: () => false,
  closeContextMenu: NOTHING,
  showToast: () => "",
  dismissToast: NOTHING,
  openScreen: () => "",
  setScreenProps: () => false,
  makeScreenCurrent: NOTHING,
  closeScreen: NOTHING,
  setScreenArrangement: NOTHING,
  replaceHistory: NOTHING,
  showStage: NOTHING,
  moveDivider: NOTHING,
  evenDivider: NOTHING,
  requestPrint: NOTHING,
  requestBack: NOTHING,
  closePicker: NOTHING,
  moveHistory: NOTHING,
  continueStep: NOTHING,
}

// 画面の操作（store が持つ形。場所に向ける操作は、場所を第 1 引数に取る）
export interface Actions extends WindowActions, PlaceActions {}

// 画面で行ったアクション 1 つ（ホストが常駐に送り、行い直しに使う）。ids は行ったときに振った id の順、lang はそのときの言語
export interface DoneAction {
  action: string
  args: unknown
  on?: ActionOn
  ids: readonly string[]
  lang: Lang
  now: string // 行った時点（ActionContext の now）
}

// アクションバルク: 同期の 1 回の流れで行ったアクションの並び（画面の履歴の段と同じ区切り）。ホストは 1 回で書き、全部通すか全部断る
export type DoneBulk = readonly DoneAction[]

// ホストが、画面で行ったアクションバルクを確かめた答え（断ったなら reason。届けられなかったものは not-saved）
export type HostAnswer = { ok: true } | { ok: false; reason: string }

export type ReadonlyStore = Pick<StoreApi<MatomezuState>, "getState" | "getInitialState" | "subscribe">

// インスタンス: 台帳アセンブルしたもの（機能台帳と、台帳アセンブルで決まる値）と、状態と操作。plugins は、台帳のもとにしたプラグイン（画面の側が見た目を引く）
export interface MatomezuInstance<Ps extends readonly Plugin[] = readonly Plugin[]> extends Assembled {
  plugins: Ps
  state: ReadonlyStore
  actions: Actions
  // 外で決まったブックと設定（常駐が知らせたもの）に入れ替え、まだ確かめられていない自分のアクションバルク replay をその上で行い直す。
  // 形に合わないブックは使わない。行い直しは observe に知らせず、断られたアクションバルクは丸ごと飛ばす。
  // change は、この知らせが、この窓のでない変更でブック book を変えたこと（by は変えた物。host は常駐が自分で行った物で、画面の履歴に入れない。
  // act は常駐が 1 回の perform に振った印、actions は行ったアクションの id の並び）。AI とほかの窓の変更は、まだ見ていない画面の履歴の段にし、見えたら画面の履歴に差し込む
  // （並びの全部が history: false のアクションなら入れない）。
  // ホストクライアントだけが使う（アクションを通さずに世界を入れ替えるので、プラグインに渡す actions には入れない）
  receive(
    world: {
      pages: readonly unknown[] // 置き場所から読んだままのページとフォルダ（ブックは、ここから組んで確かめる）
      folders: readonly unknown[]
      settings: unknown
      annotations?: unknown
      records?: unknown
      counters?: unknown
      touched?: Readonly<Record<string, string>>
      participantCalls?: Readonly<Record<string, string>>
      participantReady?: readonly string[]
      participantLive?: Readonly<Record<string, ParticipantLive>>
    },
    replay: readonly DoneBulk[],
    change?: { books: readonly string[]; by: "ai" | "window" | "host"; act: string; actions: readonly string[] },
  ): void
  // まだ見ていない画面の履歴の段が見えたかを確かめ直す（窓が見えるようになったとき。ホストクライアントだけが使う。プラグインに渡す actions には入れない）
  checkSeen(): void
  // ホストの言葉の検索（横断検索）。base のフック useWideSearch を通して使う（プラグインに渡す actions には入れない）。
  // ホストが無いか、頼めなければ、投げる（検索の見た目が受ける）
  search(query: WideSearchQuery): Promise<WideSearchAnswer>
  // 今の画面の場所（開いているブック・ページ・倍率・ずらす量・分割と、画面の場所に入れるプラグイン状態。core/address.ts・plugin-state.ts）。ホストクライアントだけが使う
  address(): Address
  // 画面の場所を address にする（core/address.ts の placeAt と、画面の場所に入れるプラグイン状態）。
  // ホストクライアントだけが使う（ブラウザの URL などの外から戻すとき。プラグインに渡す actions には入れない）
  locate(address: Address): void
  // 常駐とのつながりが、しばらく切れたままか（offline）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setOffline(offline: boolean): void
  // この窓が、最後にフォーカスされた窓か（lastWindow）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setLastWindow(last: boolean): void
  // この窓の中に戻る先があるか（canGoBack）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setCanGoBack(can: boolean): void
  // 今の利用者の設定でのキーバインドの表（作り直すのは利用者の変更が変わったときだけ。画面がキーの名前を出すのに使う）
  keys(): KeyTable
  // プラグイン状態の宣言 id の値を value にする（undefined なら消す）。ステージごとの宣言は stage のステージの値を、ステージに結ばない宣言は stage を渡さず。知らない id は E122、範囲が合わなければ E124、画面の場所に入れる宣言の形に合わない値は E123。
  // プラグインは、自分の kit と宣言を渡すフックを通して、自分の宣言だけを変える（プラグインに渡す actions には入れない）
  setPluginState(id: string, stage: string | null, value: unknown): void
  // ほかのプラグインの宣言に値を入れる道: 画面の場所に入れる宣言（address を持つ）の id と値だけで、宣言の形で確かめて入れる。入れたら true。
  // 宣言が無い・address が無い・形に合わない値・場所の無い範囲（ステージの宣言でステージを渡さない・開いていないスクリーン）は、何もせず false。
  // ステージの宣言は caller.stage のステージの値、窓の宣言は窓の値。スクリーンの宣言は、caller.screenDef（書き先のスクリーンの定義の id）の開いているスクリーン（複数なら最後にカレントにした 1 枚）の値、
  // screenDef を渡さなければ caller.screen（呼んだビューがいるスクリーン）の値（窓のカレントスクリーンには落とさない）。同じ値なら何も変わらない（ブラウザの履歴に積まない）
  setPluginStateById(
    id: string,
    value: unknown,
    caller: { screen?: string; screenDef?: string; stage?: string },
  ): boolean
  // 複数の値をまとめて書く（store には 1 回で書く。途中の、片方だけ変わった状態を知らせない）。1 つでも知らない id・範囲違い・形違いがあれば、何も書かずに error
  setPluginStates(changes: readonly (readonly [id: string, stage: string | null, value: unknown])[]): void
  // ブラウザの履歴に積むと宣言した宣言の id の組（今の台帳のもの。追加プラグインを取り込んだら変わる。ホストクライアントが、画面の場所が移動したかを決めるのに使う）
  pushing(): ReadonlySet<string>
  // 鍵 key の編集ロックを lock にする（null なら外す）。base のフック useEditLock を通して使う（プラグインに渡す actions には入れない）
  setEditLock(key: string, lock: EditLock | null): void
  // 取り込んだ追加プラグイン added を足して組み直す（前に足したものと置き換える）。状態は作ったときの初めに戻し、残したブックを新しい台帳で読み直す。
  // 台帳アセンブルで食い違う追加プラグイン（check が投げたものも）は外し、その id と error を返す
  use(
    added: readonly Plugin[],
    check?: (plugins: readonly Plugin[]) => void,
  ): { failed: { id: string; error: unknown }[] }
}

// 最初のブック（無ければ何も開かない）を開いた状態
function initialState(
  catalog: CoreCatalog,
  books: readonly Book[],
  settings: Settings,
  lang: Lang,
  unreadable: readonly Warning[] = [],
  partial: readonly Warning[] = [],
): MatomezuState {
  const tables = worldTablesOf(books, [homeOver(books)])
  const { books: open, trash } = shelvesOf(tables)
  const first = books.map(b => open[b.id]).find(b => b !== undefined) ?? null
  return {
    ...tables,
    books: open,
    unreadable,
    partial,
    window: newWindow(catalog, first),
    settings,
    annotations: {},
    records: {},
    counters: {},
    lang,
    dialog: null,
    contextMenu: null,
    toasts: [],
    touched: {},
    participantCalls: {},
    participantReady: [],
    participantLive: {},
    trash,
    offline: false,
    lastWindow: false,
    history: {},
    pluginValues: NO_PLUGIN_STATES,
    editLocks: {},
    printRequests: 0,
    backRequests: 0,
    canGoBack: false,
    historyReplaces: 0,
  }
}

// まだ見ていない AI の変更（act は常駐の changed の知らせの印）のうち、ブック book の分（places は、その変更が変えた・足した・無くしたページとフォルダの id）が、
// この窓で見えた（seen）か、見られる前に消えた（lost。消えた所と AI が書いた値）
export type AIEditTicketOutcome =
  | { book: string; act: string; places: readonly string[]; outcome: "seen" }
  | { book: string; act: string; places: readonly string[]; outcome: "lost"; lost: readonly Written[] }

export interface StoreOptions<Ps extends readonly Plugin[] = readonly Plugin[]> {
  plugins: Ps
  controlCenter?: ControlCenterId // コントロールセンターの定義の id。ブックの一覧・利用者の設定・対象の定義の種類を変えるアクションを許すかはこれが決める。無ければ、それらは断る
  books?: readonly Book[] // 最初に持つブック（最初の 1 冊を開く）。無ければ持たず、空のステージ
  autoSkin?: { light?: SkinId; dark?: SkinId } // 自動のスキン（OS の明暗に合わせる）で使うスキン。無ければ、表で最初に出てくるその明暗のスキン
  lang?: Lang | readonly string[] // 言語か、好む言語の並び（ブラウザの言語など）。インスタンスにある最初の言語を使い、無ければ英語
  savedBooks?: readonly unknown[] // 残しておいたブック（ホストが読んだもの）。このインスタンスのブックの形に合うものだけを、books のあとに持つ
  settings?: unknown // 残しておいた設定（ホストが読んだもの）。言語の項目が選んだ言語パックは、lang より優先して使う
  initial?: MatomezuState // 最初の状態をそのまま渡す（books と lang より優先する）
  newId?: () => string // ブック・ページ・アイテムの id のもとを振る。無ければ、どの世界でも重ならない uuid
  now?: () => string // アクションを行う時点（UTC の ISO 8601）を決める。無ければ今の時刻
  // アクションバルクを閉じたときに、行えたアクションの並びを知らせる（行い直しは知らせない）。ホストが確かめた答えを返せば、断られたアクションバルクの画面の履歴の段を捨てる
  observe?: (bulk: DoneBulk) => Promise<HostAnswer> | undefined
  aiEditTicket?: (change: AIEditTicketOutcome) => void // まだ見ていない AI の変更が、この窓で見えたか、見られる前に戻す・やり直すで消えたときに知らせる
  visible?: () => boolean // 窓が見えているか（裏のタブなどで見えていない間は、まだ見ていない変更を見えたとしない。無ければいつも見えている）
  search?: (query: WideSearchQuery) => Promise<WideSearchAnswer> // ホストの言葉の検索（横断検索）。無ければ、どの言葉にも横断検索の当たりなし
}

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
  continued?: true
  prior?: HistoryStep
  step?: HistoryStep
  refused?: true
}

// 表 tables から組んだ、開けるブックとゴミ箱のブック（中のブックが前に組んだ物と全部同じなら、前と同じ値を返す）
let lastShelves: { books: Library; trash: Library } = { books: {}, trash: {} }
function shelvesOf(tables: Tables): { books: Library; trash: Library } {
  const split = splitTrash(libraryOf(tables))
  const same = (a: Library, b: Library) =>
    Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([id, book]) => b[id] === book)
  lastShelves = {
    books: same(split.books, lastShelves.books) ? lastShelves.books : split.books,
    trash: same(split.trash, lastShelves.trash) ? lastShelves.trash : split.trash,
  }
  return lastShelves
}

// 表 was を changes のとおりに変えた、ページとフォルダごとの前と後（画面の履歴の段が持つ形）
function rowChanges(was: Tables, changes: TableChanges): Pick<HistoryStep, "pages" | "folders"> {
  const rows = <T>(table: Readonly<Record<string, T>>, to: Readonly<Record<string, T | typeof REMOVED>>) =>
    Object.fromEntries(
      Object.entries(to).map(([id, v]): [string, RowChange<T>] => [
        id,
        { before: table[id] ?? "none", after: v === REMOVED ? "none" : (v as T) },
      ]),
    )
  return { pages: rows(was.pages, changes.pages), folders: rows(was.folders, changes.folders) }
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
  const saved = checkBooks(catalog, options.savedBooks ?? [])
  const savedSettings = restoreSettings(options.settings)
  const initial =
    options.initial ??
    initialState(
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
  // ステージで開いている物が替わったら、まだ見ていない画面の履歴の段が見えたかを確かめ直す（下で作る checkSeen）
  store.subscribe((now, was) => {
    if (now.window !== was.window || now.books !== was.books) checkSeen()
  })
  const { getState, setState } = store
  const ctx = (): ActionContext => ({ catalog, controlCenter, lang: getState().lang, newId, now: clock(), actor: USER })
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
  // 閉じた段を画面の履歴に入れる
  const putStep = (was: OpenStep) => {
    if (was.books.length === 0 && !was.continued) return
    const { at, continued } = was
    // 同じ段の中で足して無くした物は、前も後も無いので持たない
    const kept = <T>(rows: Record<string, RowChange<T>>) =>
      Object.fromEntries(Object.entries(rows).filter(([, r]) => r.before !== "none" || r.after !== "none"))
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
  // まだ見ていない、AI とほかの窓の変更（古い順。ブックごとに 1 つの画面の履歴の段で、見えたらそのブックの画面の履歴に入る）。act は常駐が 1 回の perform に振った印。
  // book は変えたブック、before と after はその前と後（組んだ値。見えたかを、物の場所で確かめるのに使う）、
  // made はその変えた所（前から後への Patch。見えたかと、戻されたかを見るたびに求め直さない）、
  // places は変えた・足した・無くしたページとフォルダの id（常駐に、見えた・消えたと知らせる範囲）
  type Unseen = {
    step: HistoryStep
    act: string
    book: string
    before: Book
    after: Book
    made: Patch
    places: readonly string[]
  }
  let unseen: Unseen[] = []
  // 確かめた世界の、最後に知っているブック（よその変更の前の値）
  let known: Library = {}
  // ステージ st で物が見えているかの答え（プレゼンテーションの seen と、ステージの表示領域の紙の上の四角から。プレゼンテーションが答えなければ undefined。
  // 印刷プレビューの間と、表示領域を測るまでは、どの物も見えていない）
  const seenTestOf = (st: Stage): SeenTest | undefined => {
    const opened = st.opened
    const type = shownType(opened)
    const def = type && catalog.presentations.get(catalog.pageTypes.get(type)?.presentation ?? "")
    if (!def?.seen) return undefined
    const a = st.view && toPaper(st, { x: 0, y: 0 })
    const b = st.view && toPaper(st, { x: st.view.w, y: st.view.h })
    const shown = st.mode.kind === "edit" && a && b ? { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } : null
    return (page, item, book) => {
      const p = shown ? findPage(book, page)?.page : undefined
      return !!p && !!shown && !!def.seen?.(catalog, p, item, shown)
    }
  }
  // 見えているブックスクリーンのステージで見えたか
  const seenIn = (u: Unseen) =>
    shownBookScreens(catalog, getState().window)
      .flatMap(s => s.stages.stages)
      .some(
        st =>
          st.opened?.book === u.book &&
          changeSeen(u.made, { before: u.before, after: u.after }, shownPageId(st.opened), seenTestOf(st)),
      )
  // まだ見ていない変更のうち、どこかのステージで見えた物を、そのブックの画面の履歴に時刻の位置で差し込む（窓が見えていない間は差し込まない）
  const checkSeen = () => {
    if (unseen.length === 0 || options.visible?.() === false) return
    const now = unseen.filter(seenIn)
    if (now.length === 0) return
    unseen = unseen.filter(u => !now.includes(u))
    const history = { ...getState().history }
    for (const { step, act, book, places } of now) {
      history[book] = insertStep(history[book] ?? NO_HISTORY, step)
      if (step.by === "ai") options.aiEditTicket?.({ book, act, places, outcome: "seen" })
    }
    setState({ history })
  }
  // この窓の利用者の、画面の履歴に入れない変更（ブックを before から after にした）が、まだ見ていない変更が書いた値を消したら、それを捨てる
  // （あとで見えても差し込まない。AI の物は、消えた所と値を知らせる）。画面の履歴に入れる操作が上書きした物は捨てない（その画面の履歴の段の前に値が残り、見えたら差し込まれ、戻せば戻る）
  const dropOverwritten = (before: Book, after: Book) => {
    unseen = unseen.filter(u => {
      const lost = u.book === after.id ? undoneIn(u.made, before, after) : []
      if (lost.length > 0 && u.step.by === "ai")
        options.aiEditTicket?.({ book: u.book, act: u.act, places: u.places, outcome: "lost", lost })
      return lost.length === 0
    })
  }
  // よその変更 change（ブックを、確かめた世界で before から after にした）を、まだ見ていない変更に足す（ブックごとに HISTORY_LIMIT まで。古い物から捨てる）
  const addUnseen = (change: { by: "ai" | "window"; act: string }, before: Book, after: Book) => {
    const made = patchOf(before, after)
    if (!made) return
    const mine = unseen.filter(u => u.book === after.id)
    const over = mine.length >= HISTORY_LIMIT ? mine[0] : undefined
    const changes = changesBetween([before], [after])
    const step: HistoryStep = {
      at: clock(),
      by: change.by,
      books: [after.id],
      ...rowChanges(tablesOf([before]), changes),
    }
    const places = [...Object.keys(changes.pages), ...Object.keys(changes.folders)]
    unseen = [...unseen.filter(u => u !== over), { step, act: change.act, book: after.id, before, after, made, places }]
  }
  // ブック book の物を、表 was から changes のとおりに変えたことを、開いている画面の履歴の段に足す（同じ物を続けて変えたら、最初の前と最後の後を持つ）
  const record = (book: string, was: Tables, changes: TableChanges, at: string): OpenStep => {
    const into = opened(at)
    if (!into.books.includes(book)) into.books.push(book)
    const rows = rowChanges(was, changes)
    for (const [id, r] of Object.entries(rows.pages))
      into.pages[id] = { before: into.pages[id]?.before ?? r.before, after: r.after }
    for (const [id, r] of Object.entries(rows.folders))
      into.folders[id] = { before: into.folders[id]?.before ?? r.before, after: r.after }
    return into
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
    const sent: DoneAction = { action: id, args, ...(on ? { on } : {}), ids, lang: c.lang, now: c.now }
    const answer = catalog.actions.get(id)?.bulk === "alone" ? sendAlone(sent) : joinBulk(sent, c.now)
    const next: Partial<MatomezuState> = {}
    if (done.changes) {
      const tables = withChanges({ pages, folders }, done.changes)
      const shelves = shelvesOf(tables)
      next.pages = tables.pages
      next.folders = tables.folders
      next.books = shelves.books
      next.trash = shelves.trash
      if (catalog.actions.get(id)?.target === "library") {
        next.window = mapScreens(window, ws => followLibrary(catalog, ws, shelves.books, books))
        // 画面の履歴に入れないアクション（戻す・やり直す）が上書きした物は、その前の値を画面の履歴の段に残さないので捨てる
        if (catalog.actions.get(id)?.history === false)
          for (const after of Object.values(shelves.books)) {
            const before = books[after.id]
            if (before && before !== after) dropOverwritten(before, after)
          }
      } else {
        // ブックかページが対象のアクションが変えるのは、開けるブック 1 冊
        const after = Object.values(shelves.books).find(b => books[b.id] !== b)
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
    const gone = (opened: { stage: string; screen?: string } | null) => {
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
  let toasts = 0 // トーストの id の番号（出すたびに 1 つ進める）
  // プラグイン状態の宣言 id の値を value にした値の組 values（変わらなければ values のまま）。画面の場所に入れる宣言の値は宣言の形で確かめる（合わなければ E123）。
  // ステージごとの宣言は stage のステージの値（無いステージには置かない）、ステージに結ばない宣言は stage を渡さない。知らない id は E122、範囲が合わなければ E124
  // スクリーンごとの宣言は、stage に開いているスクリーンの id を渡す（無いスクリーンには置かない）
  const withPluginValue = (values: PluginValues, id: string, stage: string | null, value: unknown): PluginValues => {
    const def = defs.catalog.store.pluginStates.get(id) ?? fail("E122", { id })
    if (def.scope === "window" && stage !== null) fail("E124", { id, scope: "window", need: "give no stage" })
    if (def.scope === "stage" && stage === null) fail("E124", { id, scope: "stage", need: "give the stage" })
    if (def.scope === "screen" && stage === null) fail("E124", { id, scope: "screen", need: "give the screen" })
    let next = value
    if (value !== undefined && def.address !== "none") {
      const read = def.schema?.safeParse(value)
      if (!read?.success) fail("E123", { id })
      next = read.data
    }
    // 画面の場所に入れる宣言の値は中身を比べ、入れない宣言の値は同じ物かだけ比べる（頻繁に書く値を深く比べない）
    const same = def.address === "none" ? Object.is : sameData
    if (stage === null) {
      return same(values.window[id], next) ? values : { ...values, window: withPluginState(values.window, id, next) }
    }
    if (def.scope === "screen") {
      const opened = getState().window.screens.some(s => s.id === stage)
      if (!opened || same(values.screens[stage]?.[id], next)) return values
      return { ...values, screens: { ...values.screens, [stage]: withPluginState(values.screens[stage], id, next) } }
    }
    if (!inWindow(stage) || same(values.stages[stage]?.[id], next)) return values
    return { ...values, stages: { ...values.stages, [stage]: withPluginState(values.stages[stage], id, next) } }
  }
  const setPluginStates = (changes: readonly (readonly [id: string, stage: string | null, value: unknown])[]) => {
    const now = getState().pluginValues
    const next = changes.reduce((v, [id, stage, value]) => withPluginValue(v, id, stage, value), now)
    if (next !== now) setState({ pluginValues: next })
  }
  const setPluginState = (id: string, stage: string | null, value: unknown) => setPluginStates([[id, stage, value]])
  const setPluginStateById = (
    id: string,
    value: unknown,
    caller: { screen?: string; screenDef?: string; stage?: string },
  ): boolean => {
    const def = defs.catalog.store.pluginStates.get(id)
    if (!def || def.address === "none" || !def.schema?.safeParse(value).success) return false
    const win = getState().window
    const screenAt = (): string | null => {
      if (caller.screenDef === undefined) return caller.screen ?? null
      const ids = win.screens.filter(s => s.def === caller.screenDef).map(s => s.id)
      return [...win.order].reverse().find(o => ids.includes(o)) ?? null
    }
    const at = def.scope === "window" ? null : def.scope === "screen" ? screenAt() : (caller.stage ?? null)
    if (def.scope !== "window" && at === null) return false
    if (def.scope === "screen" && !win.screens.some(s => s.id === at)) return false
    if (def.scope === "stage" && !inWindow(at as string)) return false
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
      const pending: [string, string | null, unknown][] = []
      const working = () =>
        pending.reduce((v, [id, st, value]) => withPluginValue(v, id, st, value), getState().pluginValues)
      const updatePluginState = <S>(stateDef: PluginStateDef<S>, change: (now: S | undefined) => S | undefined) => {
        const own = ownedPluginState(owner, stateDef)
        // スクリーンごとの宣言は、呼ばれた場所のスクリーンの値
        const here = own.scope === "screen" ? call.ctx.screen.id : stage
        const at = own.scope === "window" ? null : here
        const next = change(pluginValueOf(working(), here, own))
        withPluginValue(working(), own.id, at, next) // 書く前に、範囲と形を確かめる
        pending.push([own.id, at, next])
      }
      const run = call.def.run as (ctx: unknown, actions: CommandActions, args: never) => void
      // 呼ばれた場所（ステージか、スクリーン）に向けた操作
      run(call.ctx, { ...actions, ...boundActions(actions, stage), updatePluginState }, args[0] as never)
      if (pending.length > 0) {
        const now = getState().pluginValues
        const next = working()
        if (next !== now) setState({ pluginValues: next })
      }
      return true
    },
    openDialog: (at, id, ...args) => {
      if (!defs.catalog.store.dialogs.has(id)) fail("E108", { id })
      const win = getState().window
      // ステージから開いたなら、そのステージと、それを並べているスクリーン。スクリーンから開いたなら、ステージは持たない
      const screen = screenOfStage(win, at)?.id ?? win.screens.find(s => s.id === at)?.id
      if (screen === undefined) return
      const stage = inWindow(at) ? at : NO_STAGE
      setState({ dialog: { id, stage, screen, args: args[0], submitted: 0, preview: null } })
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
      // キーの宛先: 右クリックのメニュー・長押しの道具・ダイアログを開いたステージ。無ければ（ステージを持たずに開いたダイアログも）、いちばん最近カレントにしたブックスクリーンのカレントのステージ
      const opener = dialog && dialog.stage !== NO_STAGE ? dialog.stage : undefined
      const stage = contextMenu?.stage ?? picker ?? opener ?? screenOf(window).current
      const menu = contextMenu !== null || picker !== undefined
      // プレゼンテーションのキーの範囲は、ページを開いているときだけ（空のバインダでは、プレゼンテーションのビューを描かない）
      const type = openedPage(stageIn(window, stage)?.opened ?? null)?.type
      const presentation = type && catalog.pageTypes.get(type)?.presentation
      const shown = presentation ? catalog.presentations.get(presentation)?.keyScope : undefined
      const center = !bookScreenCurrent(window)
      for (const scope of keyScopes({ menu, dialog: dialog !== null, center }, scopes, shown, reach)) {
        const hit = findKey(table, scope, key)
        if (!hit) continue
        const { command, args } = hit.binding
        const call = actions.command as (stage: string, id: string, ...args: unknown[]) => boolean
        // その場で使えないコマンドなら、次の範囲の同じキーを探す
        if (call(stage, command, ...(args === undefined ? [] : [args]))) return true
      }
      return false
    },
    openContextMenu: (stage, id, target, at, opens = "down") => {
      if (inWindow(stage)) setState({ contextMenu: { id, stage, target, at, opens } })
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
    openScreen: (def, props) => {
      const fits = catalog.screens.get(def)?.props.safeParse(props)
      if (!fits?.success) return SCREEN_REFUSED
      const { win, id } = openScreen(getState().window, catalog, def, fits.data)
      commit({ window: win })
      return id
    },
    setScreenProps: (id, props) => {
      const screen = getState().window.screens.find(s => s.id === id)
      const fits = screen && catalog.screens.get(screen.def)?.props.safeParse(props)
      if (!fits?.success) return false
      withWindow(win => withScreenProps(win, id, fits.data))
      return true
    },
    makeScreenCurrent: id => withWindow(win => makeCurrent(win, id)),
    setScreenArrangement: (def, value) => withWindow(win => setArrangement(win, catalog, def, value)),
    replaceHistory: () => setState({ historyReplaces: getState().historyReplaces + 1 }),
    closeScreen: id => withWindow(win => closeScreen(win, catalog, id)),
    showStage: id =>
      withWindow(win =>
        makeCurrent(
          mapScreenOfStage(win, id, ws => focus(ws, id)),
          screenOfStage(win, id)?.id ?? "",
        ),
      ),
    split: stage =>
      withWindow(win => {
        const ws = screenOfStage(win, stage)?.stages
        if (!ws) return win
        const focused = focus(ws, stage)
        if (focused.stages.length >= MAX_STAGES) return mapScreenOfStage(win, stage, () => focused)
        const { win: issued, id } = issueStage(win)
        return mapScreenOfStage(issued, stage, () => split(focused, id))
      }),
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
      const book = books[stageIn(window, stage)?.opened?.book ?? ""]
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
      const book = books[stageIn(window, stage)?.opened?.book ?? ""]
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
      if (stageIn(getState().window, stage)?.opened?.book !== at.book.id) actions.openBook(stage, at.book.id)
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
    openPicker: (id, at) =>
      withWindow(win =>
        mapScreenOfStage(
          mapScreens(win, ws => ws.stages.reduce((w, s) => mapStage(w, s.id, closePicker), ws)),
          id,
          ws => mapStage(ws, id, s => openPicker(s, at)),
        ),
      ),
    closePicker: () =>
      withWindow(win => mapScreens(win, ws => ws.stages.reduce((w, s) => mapStage(w, s.id, closePicker), ws))),
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
      closeStep()
      const to = from === "undo" ? "redo" : "undo"
      const { history } = getState()
      const step = (history[book] ?? NO_HISTORY)[from].at(-1)
      if (!step) return
      lastPut = Object.fromEntries(Object.entries(lastPut).filter(([id]) => !step.books.includes(id)))
      const next = { ...history }
      for (const id of step.books) {
        const was = next[id] ?? NO_HISTORY
        next[id] = { ...was, [from]: was[from].filter(s => s !== step), [to]: [...was[to], step] } as BookHistory
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
      const library = libraryOf(tables)
      const by = change?.by === "host" ? undefined : change?.by
      const recorded = change && by && change.actions.some(a => catalog.actions.get(a)?.history !== false)
      // よその変更が変えたブックごとに、まだ見ていない変更に足す
      for (const id of change?.books ?? []) {
        const was = known[id]
        const to = library[id]
        if (change && by && recorded && was && to && !sameData(was, to)) addUnseen({ by, act: change.act }, was, to)
      }
      known = library
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
      const { books, trash } = shelvesOf(tables)
      if (sameData(settings, now.settings)) settings = now.settings
      if (sameData(annotations, now.annotations)) annotations = now.annotations
      if (sameData(records, now.records)) records = now.records
      if (sameData(counters, now.counters)) counters = now.counters
      const unreadable = sameData(found.warnings, now.unreadable) ? now.unreadable : found.warnings
      const partial = sameData(found.partial, now.partial) ? now.partial : found.partial
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
        ...(books === now.books
          ? {}
          : { books, window: mapScreens(now.window, ws => followLibrary(catalog, ws, books, now.books)) }),
        ...(settings === now.settings ? {} : { settings, lang: langOf(catalog, settings, fallback) }),
        ...(annotations === now.annotations ? {} : { annotations }),
        ...(records === now.records ? {} : { records }),
        ...(counters === now.counters ? {} : { counters }),
        ...(unreadable === now.unreadable ? {} : { unreadable }),
        ...(partial === now.partial ? {} : { partial }),
      })
      checkSeen()
    },
    checkSeen,
    search: query => options.search?.(query) ?? Promise.resolve(NO_WIDE_SEARCH_HITS),
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
      const failed: { id: string; error: unknown }[] = []
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
          failed.push({ id: p.id, error })
        }
      }
      defs = next
      controlCenter = next.controlCenter
      catalog = next.catalog.core
      checked = new WeakMap()
      keyCache = null
      fallback = startLang(catalog, options.lang)
      Object.assign(instance, next, { plugins: [...plugins, ...used] })
      unseen = []
      known = {}
      const { settings } = getState()
      const again = checkBooks(catalog, options.savedBooks ?? [])
      setState(
        initialState(
          catalog,
          [...(options.books ?? []), ...again.books],
          settings,
          langOf(catalog, settings, fallback),
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

// インスタンスのステージ stage で開いているブックとページの id（何も開いていない・無いステージなら null）。テストが、開いた物を確かめるのに使う
export const openedIn = (
  instance: Pick<MatomezuInstance, "state">,
  stage = "s1",
): { book: string; page: string | null } | null => {
  const opened = stageIn(instance.state.getState().window, stage)?.opened
  return opened ? { book: opened.book, page: shownPageId(opened) } : null
}

// 画面の場所の中の、ブックスクリーンのステージの並びを読む・差し替える関数（core/address.ts。テストが、場所を作って当てはめるのに使う）
export { stagePlacesOf, withStagePlaces } from "../core/address"
