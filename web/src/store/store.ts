// 画面の状態の store（1 つ）。状態を変えるのは、ここの名前付きの操作だけ。
// 画面には読む口（state）と操作（actions）だけを渡し、setState は渡さない。計算は core の純粋な関数に任せる

import { createStore, type StoreApi } from "zustand/vanilla"
import { USER } from "../core/actor"
import { type Address, addressOf, keepPlace, placeAt } from "../core/address"
import { type Annotations, restoreAllAnnotations, withAnnotations } from "../core/annotation"
import { checkBooks, hasPages } from "../core/book"
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
import type { ActionContext, ActionOn, BookTarget } from "../core/def/action"
import { fail } from "../core/errors"
import { deepFreeze } from "../core/freeze"
import type { Point, Size } from "../core/geom"
import {
  type BookHistory,
  changeSeen,
  HISTORY_LIMIT,
  type HistoryStep,
  insertStep,
  NO_HISTORY,
  type SeenTest,
} from "../core/history"
import { detectLang, type Lang, type Params } from "../core/i18n/i18n"
import { type Library, splitTrash } from "../core/library"
import { type Mailbox, restoreMailbox } from "../core/mail"
import { type Participants, restoreParticipants } from "../core/participant"
import { type Patch, patchOf, undoneIn, type Written } from "../core/patch"
import { type ArgsOf, performIn, type Refused, type ResultOf, type TargetOf } from "../core/perform"
import { type Counters, type Records, restoreCounters, restoreRecords, withCounters, withRecord } from "../core/records"
import { sameData } from "../core/same"
import type { Book } from "../core/schema/book"
import { keyChangesOf, langOf, restoreSettings, type Settings } from "../core/settings"
import {
  closePicker,
  closePrintPreview,
  endBackground,
  openBook,
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
  startBackground,
  stopPlacing,
  toPaper,
  zoomTo,
} from "../core/stage"
import type { Warning } from "../core/warnings"
import {
  bookScreenVisible,
  bringFront,
  issueStage,
  mapScreen,
  mapScreens,
  newWindow,
  screenOf,
  type WindowState,
} from "../core/window"
import {
  close,
  evenDivider,
  focus,
  followBook,
  followLibrary,
  hasStage,
  MAX_STAGES,
  mapStage,
  moveDivider,
  setTool,
  showPage,
  split,
  togglePlacing,
  unsplit,
  type Workspace,
} from "../core/workspace"
import { type CommandArgs, type CommandId, commandContext, commandDef, commandOwner, isEnabled } from "./commands"
import type { OpenedContextMenu } from "./context-menus"
import type { DialogArgs, DialogPreview, OpenedDialog } from "./dialogs"
import { findKey, type KeyReach, type KeyTable, keyScopes, keyTable } from "./keys"
import { putPlaced, takePlaced } from "./placed-state"
import { type Assembled, assemble, type Plugin } from "./plugin"
import { worldOf } from "./world"

export type { Settings } from "../core/settings"

export interface MatomezuState {
  books: Readonly<Record<string, Book>> // ブックの id ごと（ゴミ箱のブックは除く）
  unreadable: readonly Warning[] // 残したブックのうち読めないもの（warning W004〜W006。データには手を付けず、開けない）
  partial: readonly Warning[] // 読めるが、機能台帳に無いアイテムや設定の項目を持つブック（warning W007。無い物はそのまま残す）
  window: WindowState // 窓が前に出している物と、ブックスクリーンの並び（core/window.ts）
  settings: Settings
  annotations: Annotations // ブックの id → そのブックのアノテーション（core/annotation.ts。1 つも無いブックは持たない）
  mailbox: Mailbox // 利用者の郵便箱（core/mail.ts。届いた順）
  participants: Participants // 利用者の参加者の表（core/participant.ts。要求が届いた順）
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
  trash: Readonly<Record<string, Book>> // ゴミ箱のブック（trashed のあるブック）の id ごと
  offline: boolean // 常駐とのつながりが、しばらく切れたままか（ホストクライアントが知らせる）
  lastWindow: boolean // この窓が、最後にフォーカスされた窓か（ホストクライアントが、常駐の郵便箱の知らせに添えられた値で入れる）
  // ブックの id → 画面の履歴（この画面で利用者が行ったアクションだけ。読み直すと消える）。画面の履歴の段がいくつかのブックを変えたら、その全部のブックに同じ画面の履歴の段が入る
  history: Readonly<Record<string, BookHistory>>
  // ステージの id → プラグインの id → そのプラグインが持つ、そのステージの画面の状態（中身の形はプラグインが決め、土台は読まない）
  stageStates: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  // プラグインの id → そのプラグインが持つ、窓の外観枠の状態（ステージに結ばない物。中身の形はプラグインが決め、土台は読まない。画面の場所には入れない）
  frameStates: Readonly<Record<string, unknown>>
  // 編集ロック: 掛けた所の鍵 → 利用者が直している物（ブックの id と物の id）。ホストクライアントが常駐に知らせ、常駐はそれを変える AI のアクションを断る
  editLocks: Readonly<Record<string, EditLock>>
  // 印刷を頼んだ回数（requestPrint で増える。ホストクライアントが、増えたら画面を刷る）
  printRequests: number
}

// 編集ロックの 1 つ: ブック book の物 ids（伝言など。ブックの中の物やアノテーションの id）
export interface EditLock {
  book: string
  ids: readonly string[]
}

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

// アクションの宛先。ブックが対象のアクションは、どのブックかを渡す（一覧と設定は 1 つしかないので渡さない）
// （対象の定義が足した種類のアクションは、直す・消すなら 1 件を指し、作るなら指さない）
export type PerformArgs<Id extends ActionId> =
  TargetOf<Id> extends BookTarget
    ? [args: ArgsOf<Id>, on: { book: string }]
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

export interface Actions {
  // アクションを行い、結果を状態に入れる（ビルトインプラグインのアクションも追加プラグインのアクションも、画面と AI から同じ入口を通る）。
  // ブックが変われば、そのブックを開いている全部のステージを合わせ、一覧が変われば、無くなったブックを開いていたステージは何も開かない
  perform<Id extends ActionId>(id: Id, ...args: PerformArgs<Id>): Performed<Id>
  // perform と同じく行い、ホストが確かめた答えを待って返す（ホストが断ったら、その reason。ホストが無ければ行った結果をそのまま返す）。
  // ほかの窓だけが知る事（ほかの窓の編集ロックなど）で断られたことを、利用者に知らせたいときに使う
  performConfirmed<Id extends ActionId>(id: Id, ...args: PerformArgs<Id>): Promise<Performed<Id> | HostRefused>
  // そのステージから呼んだコマンドを行う。出ていない・押せないコマンドは行わず、行ったか返す
  command<Id extends CommandId>(stage: string, id: Id, ...args: CommandArgs<Id>): boolean
  // そのステージから開くダイアログを出す（出ていたものは閉じる）。値を渡すダイアログには、その値を渡す
  openDialog<Id extends DialogId>(stage: string, id: Id, ...args: DialogArgs<Id>): void
  closeDialog(): void
  // 開いているダイアログの下書きを置く（null で消す）。ダイアログを閉じると下書きも消える
  previewDialog(preview: DialogPreview | null): void
  submitDialog(): void // 開いているダイアログに、決めるように頼む（枠が中身の form を送る）
  // 押したキー（そろえた書き方）を、開いているメニュー・ダイアログ・カレントのステージの範囲で引き、当たったコマンドを行う。
  // 範囲は狭い方から順に引き、その場で使えるコマンドに当たった所で行う（使えないキーバインドは無いものとして、次の範囲の同じキーを探す）。scopes は押した所の要素が名乗ったプラグインの範囲。
  // reach が "named" なら scopes だけを引く（テキストFormが自分で名乗った範囲）。行ったか返す
  pressKey(key: string, scopes?: readonly string[], reach?: KeyReach): boolean
  // そのステージで右クリックされた物 target のメニュー id を、画面の座標 at に出す（出ていたものは閉じる）
  openContextMenu(stage: string, id: string, target: unknown, at: Point): void
  closeContextMenu(): void
  showToast(toast: ToastInput): string // トーストを出し、その id を返す
  dismissToast(id: string): void // トーストを消す（もう無ければ何もしない）
  showControlCenter(): void // コントロールセンターを前に出す（ブックスクリーンの中は残す）
  showBookScreen(): void // ブックスクリーンを前に出す
  split(stage: string): void // そのステージをカレントにして、右に何も開いていないステージを足す
  unsplit(stage: string): void // そのステージだけを残す
  moveDivider(x: number, width: number): void // 分けている境目を、並べた幅 width の左から x の所へ（ドラッグした位置）
  evenDivider(): void // 分けている境目を真ん中に戻す
  closeStage(id: string): void // 分けたステージの 1 つを閉じ、残りで画面を使う
  focusStage(id: string): void
  openBook(stage: string, book: string): void // そのステージでブックを開き（ページを持つブックは最初のページ）、カレントにする
  openPage(stage: string, page: string): void // そのステージで開いているブックのページを開き、カレントにして、ブックスクリーンを前に出す
  resizeStage(id: string, view: Size): void // 表示領域の大きさが変わった
  // 見せ方が描く広さ（可変ページ。null なら紙 1 枚）と、描く中身を右・下へずらした量（印刷区画の数。位置をデータに持たない見せ方）
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
  setPreviewArea(id: string, area: Size): void // 印刷プレビューで並べた広さ（見せ方が知らせる）
  requestPrint(): void // 画面を刷ってほしいと頼む（刷るのはホストクライアント。刷る物は画面が印刷のときだけ出す）
  // そのステージが使う道具の組の道具を替える（同じ組を使うステージが全部替わり、置こうとしていたアイテムは取り消す）
  setTool(stage: string, tool: ToolId): void
  togglePlacing(stage: string, item: ItemId): void // そのステージでアイテムを置こうとする（同じものなら取り消す）
  stopPlacing(stage: string): void
  select(stage: string, ids: readonly string[]): void // そのステージで選ぶ物（開いているページのもの）
  // そのステージで選んでいる物を、その場で編集し始める・終える（何をするかを名前で分けるときは、その名前で始める）
  setEditing(stage: string, editing: boolean | string): void
  // そのステージで道具のアイコンを、画面の座標 at（null なら画面が決める所）に開く（ほかのステージで開いていたものは閉じる）
  openPicker(stage: string, at: Point | null): void
  closePicker(): void
  // ブック book の画面の履歴の、戻せる（from が undo）かやり直せる（redo）最後の画面の履歴の段を、反対の側へ移す。それが変えたほかのブックの画面の履歴でも移す。
  // 画面の履歴の段を戻す・やり直すアクションを行えたあとに呼ぶ
  moveHistory(book: string, from: "undo" | "redo"): void
  // 同じ処理の中でこのあと行うアクションを、ブック book の最後の画面の履歴の段に足す（足して始めたその場の編集を確定するとき。足すのと書くのを 1 つの画面の履歴の段にする）。
  // 足すのは、そのブックに最後に入れた画面の履歴の段が、そのブックの最後の物のときだけ（元に戻す・やり直すのあとは足さずに、別の画面の履歴の段になる）。
  // 足したあと何も変わらなければ（足した物を書かずに消したなど）、その画面の履歴の段ごと無くなる
  continueStep(book: string): void
}

// 画面で行ったアクション 1 つ（ホストが常駐に送り、行い直しに使う）。ids は行ったときに振った id の順、lang はそのときの言語
export interface DoneAction {
  action: string
  args: unknown
  on?: ActionOn
  ids: readonly string[]
  lang: Lang
  now: string // 行った時点（ActionContext の now）
}

// ホストが、画面で行ったアクションを確かめた答え（断ったなら reason。届けられなかったものは not-saved）
export type HostAnswer = { ok: true } | { ok: false; reason: string }

export type ReadonlyStore = Pick<StoreApi<MatomezuState>, "getState" | "getInitialState" | "subscribe">

// インスタンス: 台帳アセンブルしたもの（機能台帳と、台帳アセンブルで決まる値）と、状態と操作。plugins は、台帳のもとにしたプラグイン（画面の側が見た目を引く）
export interface MatomezuInstance<Ps extends readonly Plugin[] = readonly Plugin[]> extends Assembled {
  plugins: Ps
  state: ReadonlyStore
  actions: Actions
  // 外で決まったブックと設定（常駐が知らせたもの）に入れ替え、まだ確かめられていない自分のアクション replay をその上で行い直す。
  // 形に合わないブックは使わない。行い直しは observe に知らせず、断られたものは飛ばす。
  // change は、この知らせが、この窓のでない変更でブック book を変えたこと（by は変えた物。host は常駐が自分で行った物で、画面の履歴に入れない。
  // act は常駐が 1 回の perform に振った印、action は行ったアクションの id）。AI とほかの窓の変更は、まだ見ていない画面の履歴の段にし、見えたら画面の履歴に差し込む
  // （history: false のアクションの変更は入れない）。
  // ホストクライアントだけが使う（アクションを通さずに世界を入れ替えるので、プラグインに渡す actions には入れない）
  receive(
    world: {
      books: readonly unknown[]
      settings: unknown
      annotations?: unknown
      mailbox?: unknown
      participants?: unknown
      records?: unknown
      counters?: unknown
      touched?: Readonly<Record<string, string>>
      participantCalls?: Readonly<Record<string, string>>
      participantReady?: readonly string[]
    },
    replay: readonly DoneAction[],
    change?: { book: string; by: "ai" | "window" | "host"; act: string; action: string },
  ): void
  // まだ見ていない画面の履歴の段が見えたかを確かめ直す（窓が見えるようになったとき。ホストクライアントだけが使う。プラグインに渡す actions には入れない）
  checkSeen(): void
  // 今の画面の場所（開いているブック・ページ・倍率・ずらす量・分割と、場所に入れる画面の状態。core/address.ts・placed-state.ts）。ホストクライアントだけが使う
  address(): Address
  // 画面の場所を address にする（core/address.ts の placeAt と、場所に入れる画面の状態）。
  // ホストクライアントだけが使う（ブラウザの URL などの外から戻すとき。プラグインに渡す actions には入れない）
  locate(address: Address): void
  // 常駐とのつながりが、しばらく切れたままか（offline）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setOffline(offline: boolean): void
  // この窓が、最後にフォーカスされた窓か（lastWindow）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setLastWindow(last: boolean): void
  // 今の利用者の設定でのキーバインドの表（作り直すのは利用者の変更が変わったときだけ。画面がキーの名前を出すのに使う）
  keys(): KeyTable
  // プラグイン owner（プラグインの id）が持つ、ステージ stage の画面の状態を value にする（undefined なら消す）。無いステージには置かない。
  // プラグインは、自分の kit を渡すフック useSetStageState を通して、自分の置き場だけを変える（プラグインに渡す actions には入れない）
  setStageState(stage: string, owner: string, value: unknown): void
  // プラグイン owner（プラグインの id）が持つ、窓の外観枠の状態を value にする（undefined なら消す）。
  // プラグインは、自分の kit を渡すフック useSetFrameState を通して、自分の置き場だけを変える（プラグインに渡す actions には入れない）
  setFrameState(owner: string, value: unknown): void
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
  const { books: open, trash } = splitTrash(Object.fromEntries(books.map(b => [b.id, b])))
  const first = books.find(b => b.id in open) ?? null
  return {
    books: { ...open },
    unreadable,
    partial,
    window: newWindow(catalog, first),
    settings,
    annotations: {},
    mailbox: [],
    participants: [],
    records: {},
    counters: {},
    lang,
    dialog: null,
    contextMenu: null,
    toasts: [],
    touched: {},
    participantCalls: {},
    participantReady: [],
    trash: { ...trash },
    offline: false,
    lastWindow: false,
    history: {},
    stageStates: {},
    frameStates: {},
    editLocks: {},
    printRequests: 0,
  }
}

// まだ見ていない AI の変更（act は常駐の book の知らせの印）が、この窓で見えた（seen）か、見られる前に消えた（lost。消えた所と AI が書いた値）
export type AIEditTicketOutcome =
  | { book: string; act: string; outcome: "seen" }
  | { book: string; act: string; outcome: "lost"; lost: readonly Written[] }

export interface StoreOptions<Ps extends readonly Plugin[] = readonly Plugin[]> {
  plugins: Ps
  controlCenter?: ControlCenterId // コントロールセンターの定義の id。ブックの一覧・利用者の設定・郵便箱・参加者の表を変えるアクションを許すかはこれが決める。無ければ、それらは断る
  books?: readonly Book[] // 最初に持つブック（最初の 1 冊を開く）。無ければ持たず、空のステージ
  autoSkin?: { light?: SkinId; dark?: SkinId } // 自動のスキン（OS の明暗に合わせる）で使うスキン。無ければ、表で最初に出てくるその明暗のスキン
  lang?: Lang | readonly string[] // 言語か、好む言語の並び（ブラウザの言語など）。インスタンスにある最初の言語を使い、無ければ英語
  savedBooks?: readonly unknown[] // 残しておいたブック（ホストが読んだもの）。このインスタンスのブックの形に合うものだけを、books のあとに持つ
  settings?: unknown // 残しておいた設定（ホストが読んだもの）。言語の項目が選んだ言語パックは、lang より優先して使う
  initial?: MatomezuState // 最初の状態をそのまま渡す（books と lang より優先する）
  newId?: () => string // ブック・ページ・アイテムの id のもとを振る。無ければ、どの世界でも重ならない uuid
  now?: () => string // アクションを行う時点（UTC の ISO 8601）を決める。無ければ今の時刻
  // アクションを行えたときに知らせる（行い直しは知らせない）。ホストが確かめた答えを返せば、断られたアクションを入れた画面の履歴の段を捨てる
  observe?: (done: DoneAction) => Promise<HostAnswer> | undefined
  aiEditTicket?: (change: AIEditTicketOutcome) => void // まだ見ていない AI の変更が、この窓で見えたか、見られる前に戻す・やり直すで消えたときに知らせる
  visible?: () => boolean // 窓が見えているか（裏のタブなどで見えていない間は、まだ見ていない変更を見えたとしない。無ければいつも見えている）
}

// 開いている画面の履歴の段。step は閉じて画面の履歴に入れた段、refused はホストが中のアクションを断ったこと。
// continued は続けた画面の履歴の段（continueStep）で、prior は続ける前の画面の履歴の段（断られたらこの段に戻す。続ける前に通っていた変更は元に戻せるまま残す）
interface OpenStep {
  at: string
  books: Record<string, { before: Book; after: Book }>
  continued?: true
  prior?: HistoryStep
  step?: HistoryStep
  refused?: true
}

// 知らされた一覧 next を、今の一覧 now に寄せる: 中身の同じブックは前の値を使い（描き直しと、保存の知らせを減らす）、全部同じなら now を返す
function sameAs(next: Library, now: Record<string, Book>): Record<string, Book> {
  const kept: Record<string, Book> = {}
  for (const [id, b] of Object.entries(next)) {
    const old = now[id]
    kept[id] = old && old !== b && sameData(old, b) ? old : b
  }
  const same =
    Object.keys(kept).length === Object.keys(now).length && Object.entries(kept).every(([id, b]) => now[id] === b)
  return same ? now : kept
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
  // キーバインドの表（利用者の変更が変わったときだけ作り直す）
  let keyCache: { settings: Settings; table: KeyTable } | null = null
  const keysFor = (settings: Settings): KeyTable => {
    if (keyCache?.settings !== settings)
      keyCache = { settings, table: keyTable([...defs.catalog.store.keys.values()], keyChangesOf(catalog, settings)) }
    return keyCache.table
  }
  // 前に出せるブックスクリーンのステージの並びに操作をかける
  const withWorkspace = (change: (ws: Workspace) => Workspace) => withWindow(win => mapScreen(win, change))
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
    const { at, books, continued } = was
    const step: HistoryStep = { at, by: "user", books }
    open = null
    // 入れる前にホストが断ったなら入れない（続けた画面の履歴の段なら、続ける前の画面の履歴の段に戻す）
    if (was.refused) {
      if (was.prior) putBack(was.prior)
      return
    }
    // 続けた画面の履歴の段で何も変わらなかった（足した物を書かずに消したなど）なら入れない
    if (continued && Object.values(books).every(b => sameData(b.before, b.after))) return
    was.step = step
    const history = { ...getState().history }
    for (const id of Object.keys(step.books))
      history[id] = { undo: [...(history[id] ?? NO_HISTORY).undo, step].slice(-HISTORY_LIMIT), redo: [] }
    setState({ history })
    lastPut = { ...lastPut, ...Object.fromEntries(Object.keys(step.books).map(id => [id, step])) }
  }
  // 続ける前の画面の履歴の段 prior を、画面の履歴の最後に戻す（続けた画面の履歴の段が断られたとき）
  const putBack = (prior: HistoryStep) => {
    const history = { ...getState().history }
    for (const id of Object.keys(prior.books))
      history[id] = { undo: [...(history[id] ?? NO_HISTORY).undo, prior].slice(-HISTORY_LIMIT), redo: [] }
    setState({ history })
    lastPut = { ...lastPut, ...Object.fromEntries(Object.keys(prior.books).map(id => [id, prior])) }
  }
  // まだ見ていない、AI とほかの窓の変更（古い順。ブックごとに 1 つの画面の履歴の段で、見えたらそのブックの画面の履歴に入る）。act は常駐が 1 回の perform に振った印。
  // book は変えたブック、made はその変えた所（前から後への Patch。見えたかと、戻されたかを見るたびに求め直さない）
  type Unseen = { step: HistoryStep; act: string; book: string; made: Patch }
  let unseen: Unseen[] = []
  // 確かめた世界の、最後に知っているブック（よその変更の前の値）
  let known: Library = {}
  // ステージ st で物が見えているかの答え（見せ方の seen と、ステージの表示領域の紙の上の四角から。見せ方が答えなければ undefined。
  // 印刷プレビューの間と、表示領域を測るまでは、どの物も見えていない）
  const seenTestOf = (st: Stage): SeenTest | undefined => {
    const opened = st.opened
    const def = opened && catalog.presentations.get(catalog.bookTypes.get(opened.type)?.presentation ?? "")
    if (!def?.seen) return undefined
    const a = st.view && toPaper(st, { x: 0, y: 0 })
    const b = st.view && toPaper(st, { x: st.view.w, y: st.view.h })
    const shown = st.mode.kind === "edit" && a && b ? { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } : null
    return (page, item, book) => {
      const p = shown && hasPages(book) ? book.pages.find(x => x.id === page) : undefined
      return !!p && !!shown && !!def.seen?.(catalog, p, item, shown)
    }
  }
  const seenIn = (u: Unseen) =>
    bookScreenVisible(getState().window) &&
    screenOf(getState().window).stages.some(
      st =>
        st.opened?.book === u.book &&
        changeSeen(u.made, u.step.books[u.book] as HistoryStep["books"][string], st.opened.page, seenTestOf(st)),
    )
  // まだ見ていない変更のうち、どこかのステージで見えた物を、そのブックの画面の履歴に時刻の位置で差し込む（窓が見えていない間は差し込まない）
  const checkSeen = () => {
    if (unseen.length === 0 || options.visible?.() === false) return
    const now = unseen.filter(seenIn)
    if (now.length === 0) return
    unseen = unseen.filter(u => !now.includes(u))
    const history = { ...getState().history }
    for (const { step, act, book } of now) {
      history[book] = insertStep(history[book] ?? NO_HISTORY, step)
      if (step.by === "ai") options.aiEditTicket?.({ book, act, outcome: "seen" })
    }
    setState({ history })
  }
  // この窓の利用者の、画面の履歴に入れない変更（ブックを before から after にした）が、まだ見ていない変更が書いた値を消したら、それを捨てる
  // （あとで見えても差し込まない。AI の物は、消えた所と値を知らせる）。画面の履歴に入れる操作が上書きした物は捨てない（その画面の履歴の段の前に値が残り、見えたら差し込まれ、戻せば戻る）
  const dropOverwritten = (before: Book, after: Book) => {
    unseen = unseen.filter(u => {
      const lost = u.book === after.id ? undoneIn(u.made, before, after) : []
      if (lost.length > 0 && u.step.by === "ai")
        options.aiEditTicket?.({ book: u.book, act: u.act, outcome: "lost", lost })
      return lost.length === 0
    })
  }
  // よその変更 change（ブックを、確かめた世界で before から after にした）を、まだ見ていない変更に足す（ブックごとに HISTORY_LIMIT まで。古い物から捨てる）
  const addUnseen = (change: { by: "ai" | "window"; act: string }, before: Book, after: Book) => {
    const made = patchOf(before, after)
    if (!made) return
    const step: HistoryStep = { at: clock(), by: change.by, books: { [after.id]: { before, after } } }
    const mine = unseen.filter(u => u.book === after.id)
    const over = mine.length >= HISTORY_LIMIT ? mine[0] : undefined
    unseen = [...unseen.filter(u => u !== over), { step, act: change.act, book: after.id, made }]
  }
  const record = (before: Book, after: Book, at: string): OpenStep => {
    if (!open) {
      open = { at, books: {} }
      queueMicrotask(closeStep)
    }
    open.books[after.id] = { before: open.books[after.id]?.before ?? before, after }
    return open
  }
  // ホストが断ったアクションを入れた画面の履歴の段 at を捨てる（その段は、断られた変更を戻そうとして、その間のほかの変更を消してしまうため。
  // 同じ段のほかのアクションの変更も、元に戻すで戻せなくなる。ただし続けた画面の履歴の段なら、続ける前の画面の履歴の段は戻し、その変更は元に戻せるまま残す）
  const dropRefused = (at: OpenStep) => {
    at.refused = true
    const step = at.step
    if (!step) return
    const history = { ...getState().history }
    for (const id of Object.keys(step.books)) {
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
    const { books, window, annotations } = getState()
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
    const answer =
      options.observe?.({ action: id, args, ...(on ? { on } : {}), ids, lang: c.lang, now: c.now }) ?? undefined
    const next: Partial<MatomezuState> = {}
    if (done.book) {
      const before = books[done.book.id]
      const recorded = catalog.actions.get(id)?.history !== false
      if (before && recorded) {
        const at = record(before, done.book, c.now)
        void answer?.then(a => a.ok || dropRefused(at))
      }
      // 画面の履歴に入れないアクション（戻す・やり直すなど）が上書きした物は、その前の値を画面の履歴の段に残さないので捨てる
      if (before && !recorded) dropOverwritten(before, done.book)
      next.books = { ...books, [done.book.id]: done.book }
      next.window = mapScreens(window, ws => followBook(catalog, ws, done.book as Book, books[(done.book as Book).id]))
    }
    if (done.books) {
      const split = splitTrash(done.books)
      next.books = { ...split.books }
      next.trash = { ...split.trash }
      next.window = mapScreens(window, ws => followLibrary(catalog, ws, split.books, books))
    }
    if (done.settings) {
      next.settings = done.settings
      next.lang = langOf(catalog, done.settings, fallback)
    }
    if (done.annotations) next.annotations = withAnnotations(annotations, done.annotations)
    if (done.mailbox) next.mailbox = done.mailbox
    if (done.participants) next.participants = done.participants
    if (done.record) {
      next.records = withRecord(getState().records, done.record)
      if (done.record.counters) next.counters = withCounters(getState().counters, done.record)
    }
    return { ok: true, result: done.result, next, answer }
  }
  // 状態の差分を入れる（何も変わらなければ知らせない）。開いたステージが無くなったダイアログと右クリックのメニューは閉じ、そのステージの画面の状態は消す
  const commit = (next: Partial<MatomezuState>) => {
    if (Object.keys(next).length === 0) return
    const { dialog, contextMenu } = getState()
    const stageStates = next.stageStates ?? getState().stageStates
    const stages = next.window?.screens.flatMap(ws => ws.stages)
    const gone = (opened: { stage: string } | null) =>
      stages !== undefined && opened !== null && !stages.some(s => s.id === opened.stage)
    const kept = stages && Object.keys(stageStates).filter(id => stages.some(s => s.id === id))
    setState({
      ...next,
      ...(gone(dialog) ? { dialog: null } : {}),
      ...(gone(contextMenu) ? { contextMenu: null } : {}),
      ...(kept && kept.length < Object.keys(stageStates).length
        ? { stageStates: Object.fromEntries(kept.map(id => [id, stageStates[id] ?? {}])) }
        : {}),
    })
  }
  // 今の画面の場所（ステージごとの場所に入れる画面の状態も）
  const addressNow = () => {
    const { window, stageStates } = getState()
    return addressOf(window, stage => takePlaced(defs.catalog.store.placedStates, stageStates[stage]))
  }
  // ステージ stage が窓のどれかのブックスクリーンにあるか
  const inWindow = (stage: string) => getState().window.screens.some(ws => hasStage(ws, stage))
  let toasts = 0 // トーストの id の番号（出すたびに 1 つ進める）
  // プラグイン owner の、ステージ stage の画面の状態を value にする（undefined なら消す。無いステージには置かない）
  const setStageState = (stage: string, owner: string, value: unknown) => {
    const { stageStates: now, window } = getState()
    const { [owner]: _, ...rest } = now[stage] ?? {}
    if (value === undefined) {
      if (now[stage] && owner in now[stage]) setState({ stageStates: { ...now, [stage]: rest } })
    } else if (window.screens.some(ws => hasStage(ws, stage)))
      setState({ stageStates: { ...now, [stage]: { ...rest, [owner]: value } } })
  }
  // プラグイン owner の、窓の外観枠の状態を value にする（undefined なら消す）
  const setFrameState = (owner: string, value: unknown) => {
    const { frameStates: now } = getState()
    const { [owner]: _, ...rest } = now
    if (value === undefined) {
      if (owner in now) setState({ frameStates: rest })
    } else setState({ frameStates: { ...rest, [owner]: value } })
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
      const def = commandDef(defs, id)
      const ctx = commandContext(catalog, controlCenter, state, stage, id)
      if (!ctx || !isEnabled(defs, state, stage, id, args[0])) return false
      const owner = commandOwner(id)
      const updateStageState = (change: (now: unknown) => unknown) =>
        setStageState(stage, owner, change(getState().stageStates[stage]?.[owner]))
      const updateFrameState = (change: (now: unknown) => unknown) =>
        setFrameState(owner, change(getState().frameStates[owner]))
      def.run(ctx, { ...actions, updateStageState, updateFrameState }, args[0] as never)
      return true
    },
    openDialog: (stage, id, ...args) => {
      if (!defs.catalog.store.dialogs.has(id)) fail("E108", { id })
      if (inWindow(stage)) setState({ dialog: { id, stage, args: args[0], submitted: 0, preview: null } })
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
      const workspace = screenOf(window)
      const table = keysFor(settings)
      const picker = workspace.stages.find(s => s.picker !== null)?.id
      const stage = contextMenu?.stage ?? picker ?? dialog?.stage ?? workspace.current
      const menu = contextMenu !== null || picker !== undefined
      const type = workspace.stages.find(s => s.id === stage)?.opened?.type
      const presentation = type && catalog.bookTypes.get(type)?.presentation
      const shown = presentation ? catalog.presentations.get(presentation)?.keyScope : undefined
      const center = window.front === "control-center"
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
    openContextMenu: (stage, id, target, at) => {
      if (inWindow(stage)) setState({ contextMenu: { id, stage, target, at } })
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
    showControlCenter: () => withWindow(win => bringFront(win, "control-center")),
    showBookScreen: () => withWindow(win => bringFront(win, "book-screen")),
    split: stage =>
      withWindow(win => {
        const ws = screenOf(win)
        if (!hasStage(ws, stage)) return win
        const focused = focus(ws, stage)
        if (focused.stages.length >= MAX_STAGES) return mapScreen(win, () => focused)
        const { win: issued, id } = issueStage(win)
        return mapScreen(issued, () => split(focused, id))
      }),
    unsplit: stage => withWorkspace(ws => (hasStage(ws, stage) ? unsplit(focus(ws, stage)) : ws)),
    moveDivider: (x, width) => withWorkspace(ws => moveDivider(ws, x, width)),
    evenDivider: () => withWorkspace(evenDivider),
    closeStage: id => withWorkspace(ws => close(ws, id)),
    focusStage: id => withWorkspace(ws => focus(ws, id)),
    openBook: (stage, bookId) => {
      const book = getState().books[bookId]
      // ブックを開くと、見る側のブックスクリーンを前に出す
      if (book && inWindow(stage))
        withWindow(win =>
          bringFront(
            mapScreen(win, ws => mapStage(focus(ws, stage), stage, s => openBook(catalog, s, book))),
            "book-screen",
          ),
        )
    },
    openPage: (stage, page) => {
      const { books, window } = getState()
      const book = books[screenOf(window).stages.find(s => s.id === stage)?.opened?.book ?? ""]
      // ページを開くと、見る側のブックスクリーンを前に出す
      if (book && hasPages(book) && inWindow(stage))
        withWindow(win =>
          bringFront(
            mapScreen(win, ws => showPage(catalog, focus(ws, stage), stage, book, page)),
            "book-screen",
          ),
        )
    },
    resizeStage: (id, view) => withWorkspace(ws => mapStage(ws, id, s => resize(s, view))),
    setStageArea: (id, area, origin) => withWorkspace(ws => mapStage(ws, id, s => setArea(s, area, origin))),
    setStageStart: (id, start) => withWorkspace(ws => mapStage(ws, id, s => setStart(s, start))),
    panStageBy: (id, dx, dy) => withWorkspace(ws => mapStage(ws, id, s => panBy(s, dx, dy))),
    zoomStage: (id, zoom, at) => withWorkspace(ws => mapStage(ws, id, s => zoomTo(s, zoom, at))),
    resetStageView: id => withWorkspace(ws => mapStage(ws, id, resetView)),
    openPrintPreview: id => withWorkspace(ws => mapStage(ws, id, openPrintPreview)),
    closePrintPreview: id => withWorkspace(ws => mapStage(ws, id, closePrintPreview)),
    startBackground: id => withWorkspace(ws => mapStage(ws, id, s => startBackground(catalog, s))),
    endBackground: id => withWorkspace(ws => mapStage(ws, id, endBackground)),
    requestPrint: () => setState({ printRequests: getState().printRequests + 1 }),
    setPreviewArea: (id, area) => withWorkspace(ws => mapStage(ws, id, s => setPreviewArea(s, area))),
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
    continueStep: book => {
      closeStep()
      const { history } = getState()
      const step = history[book]?.undo.at(-1)
      if (!step || step !== lastPut[book]) return
      const next = { ...history }
      for (const id of Object.keys(step.books)) {
        const was = next[id] ?? NO_HISTORY
        next[id] = { ...was, undo: was.undo.filter(s => s !== step) }
      }
      setState({ history: next })
      open = { at: step.at, books: { ...step.books }, continued: true, prior: step }
      queueMicrotask(closeStep)
    },
    moveHistory: (book, from) => {
      closeStep()
      const to = from === "undo" ? "redo" : "undo"
      const { history } = getState()
      const step = (history[book] ?? NO_HISTORY)[from].at(-1)
      if (!step) return
      lastPut = Object.fromEntries(Object.entries(lastPut).filter(([id]) => !(id in step.books)))
      const next = { ...history }
      for (const id of Object.keys(step.books)) {
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
      const found = restore(world.books)
      let library: Library = Object.fromEntries(found.books.map(b => [b.id, b]))
      const was = known[change?.book ?? ""]
      const to = library[change?.book ?? ""]
      const by = change?.by === "host" ? undefined : change?.by
      const recorded = change && by && catalog.actions.get(change.action)?.history !== false
      if (change && by && recorded && was && to && !sameData(was, to)) addUnseen({ by, act: change.act }, was, to)
      known = library
      let settings = restoreSettings(world.settings)
      let annotations = restoreAllAnnotations(world.annotations)
      let mailbox = world.mailbox === undefined ? getState().mailbox : restoreMailbox(world.mailbox)
      let participants =
        world.participants === undefined ? getState().participants : restoreParticipants(world.participants)
      let records = world.records === undefined ? getState().records : restoreRecords(world.records)
      let counters = world.counters === undefined ? getState().counters : restoreCounters(world.counters)
      for (const done of replay) {
        const ids = [...done.ids]
        // 読み直した世界の上で行い直して投げるアクションは、断られたものと同じに落とし、あとの行い直しを続ける
        const next = (() => {
          try {
            return performIn(
              { books: library, settings, annotations, mailbox, participants, records, counters },
              done.action,
              done.args,
              done.on,
              {
                catalog,
                controlCenter,
                lang: done.lang,
                newId: () => ids.shift() ?? newId(),
                now: done.now,
                actor: USER,
              },
            )
          } catch {
            return null
          }
        })()
        if (!next?.ok) continue
        if (next.book) library = { ...library, [next.book.id]: next.book }
        if (next.books) library = next.books
        if (next.settings) settings = next.settings
        if (next.mailbox) mailbox = next.mailbox
        if (next.participants) participants = next.participants
        if (next.record) {
          records = withRecord(records, next.record)
          counters = withCounters(counters, next.record)
        }
        annotations = withAnnotations(annotations, next.annotations)
      }
      const now = getState()
      const split = splitTrash(library)
      const books = sameAs(split.books, now.books)
      const trash = sameAs(split.trash, now.trash)
      if (sameData(settings, now.settings)) settings = now.settings
      if (sameData(annotations, now.annotations)) annotations = now.annotations
      if (sameData(mailbox, now.mailbox)) mailbox = now.mailbox
      if (sameData(participants, now.participants)) participants = now.participants
      if (sameData(records, now.records)) records = now.records
      if (sameData(counters, now.counters)) counters = now.counters
      const unreadable = sameData(found.warnings, now.unreadable) ? now.unreadable : found.warnings
      const partial = sameData(found.partial, now.partial) ? now.partial : found.partial
      const touched = world.touched === undefined || sameData(world.touched, now.touched) ? now.touched : world.touched
      const participantCalls =
        world.participantCalls === undefined || sameData(world.participantCalls, now.participantCalls)
          ? now.participantCalls
          : world.participantCalls
      const participantReady =
        world.participantReady === undefined || sameData(world.participantReady, now.participantReady)
          ? now.participantReady
          : world.participantReady
      commit({
        ...(touched === now.touched ? {} : { touched }),
        ...(participantCalls === now.participantCalls ? {} : { participantCalls }),
        ...(participantReady === now.participantReady ? {} : { participantReady }),
        ...(trash === now.trash ? {} : { trash }),
        ...(books === now.books
          ? {}
          : { books, window: mapScreens(now.window, ws => followLibrary(catalog, ws, books, now.books)) }),
        ...(settings === now.settings ? {} : { settings, lang: langOf(catalog, settings, fallback) }),
        ...(annotations === now.annotations ? {} : { annotations }),
        ...(mailbox === now.mailbox ? {} : { mailbox }),
        ...(participants === now.participants ? {} : { participants }),
        ...(records === now.records ? {} : { records }),
        ...(counters === now.counters ? {} : { counters }),
        ...(unreadable === now.unreadable ? {} : { unreadable }),
        ...(partial === now.partial ? {} : { partial }),
      })
      checkSeen()
    },
    checkSeen,
    address: () => addressNow(),
    locate: address => {
      const now = getState()
      if (sameData(addressNow(), address)) {
        const kept = keepPlace(now.window)
        if (kept !== now.window) commit({ window: kept })
        return
      }
      const win = placeAt(catalog, now.books, now.window, address)
      const placed = defs.catalog.store.placedStates
      // ステージごとの置き場に場所の値を戻す（空になった置き場は消す）
      const stageStates: Record<string, Readonly<Record<string, unknown>>> = {}
      screenOf(win).stages.forEach((st, i) => {
        const put = putPlaced(placed, now.stageStates[st.id], address.stages[i]?.states ?? {})
        if (Object.keys(put).length > 0) stageStates[st.id] = put
      })
      commit({
        ...(win === now.window ? {} : { window: win }),
        ...(sameData(stageStates, now.stageStates) ? {} : { stageStates }),
      })
    },
    setStageState,
    setFrameState,
    setEditLock: (key, lock) => {
      const { [key]: now, ...rest } = getState().editLocks
      if (!lock) {
        if (now) setState({ editLocks: rest })
      } else if (!now || now.book !== lock.book || !sameData(now.ids, lock.ids))
        setState({ editLocks: { ...rest, [key]: lock } })
    },
    setOffline: offline => {
      if (getState().offline !== offline) setState({ offline })
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
