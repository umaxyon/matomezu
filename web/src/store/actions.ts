// 画面の操作の形と並び: 窓に向ける操作・ほかを名指す操作・場所に向ける操作と、行ったアクションの結果。
// 操作の名前の並びと、場所に向けた形・窓に向ける物だけを選んだ形を作る関数も持つ（中身を行うのは store.ts のインスタンス）

import type { ActionId, DialogId, ItemId, SubjectId, ToolId } from "../core/catalog"
import type { PageTarget } from "../core/def/action"
import type { Point, Size } from "../core/geom"
import type { ArgsOf, Refused, ResultOf, TargetOf } from "../core/perform"
import type { Editing } from "../core/stage"
import type { CommandArgs, CommandId } from "./commands"
import type { MenuOpens } from "./context-menus"
import type { DialogArgs, DialogPreview } from "./dialogs"
import type { KeyReach } from "./keys"
import type { ToastInput } from "./state"

// openScreen が開かなかったときに返す値
export const SCREEN_REFUSED = "refused"

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
  // ブックが変われば、そのブックを開いている全部のステージを合わせ、一覧が変われば、無くなったブックを開いていたステージを閉じる
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
  // スクリーンを 1 枚開いてカレントにし、開けたかを返す。def はスクリーンの定義の id、props は渡す値（定義の props の形）。
  // 機能台帳に無い定義・形に合わない値なら開かず、false を返す
  openScreen(def: string, props: unknown): boolean
  // ブックを窓に出す: もう開いているブックスクリーンが在れば、それをカレントスクリーンにする。無ければ、新しいブックスクリーンで開く
  // （開いたままにする枚数を超えた分は、土台がカレントにしたのが古い物から閉じる）。page を言えば、そのページを開く。無いブックなら何もせず false
  showBook(book: string, page?: string): boolean
  // スクリーンアレンジメントを定義 def と値 value に替える（値を渡さなければ、定義の初めの値。機能台帳に無い定義・値が定義の形に合わなければ替えない）
  setScreenArrangement(def: string, value?: unknown): void
  // 同じ同期の処理の中の窓の変わりを、ブラウザの履歴に積まずに書き換えてほしいと頼む（利用者の操作でない変わり。窓の大きさでスクリーンアレンジメントを戻すなど）
  replaceHistory(): void
  moveDivider(x: number, width: number): void // 分けている境目を、並べた幅 width の左から x の所へ（ドラッグした位置）
  evenDivider(): void // 分けている境目を真ん中に戻す
  requestPrint(): void // 画面を刷ってほしいと頼む（刷るのはホストクライアント。刷る物は画面が印刷のときだけ出す）
  requestBack(): void // ブラウザの履歴を 1 つ戻してほしいと頼む（戻すのはホストクライアント。戻る先が無い canGoBack が false のときは、頼んでも何も起きない）
  closePicker(): void
  // ステージエントリ outermost の画面の履歴（outermost が LIBRARY_HISTORY なら、書庫の履歴）の、戻せる（from が undo）かやり直せる（redo）最後の画面の履歴の段を、反対の側へ移す。それが変えたほかのステージエントリの画面の履歴でも移す。
  // 画面の履歴の段を戻す・やり直すアクションを行えたあとに呼ぶ
  moveHistory(outermost: string, from: "undo" | "redo"): void
  // ステージエントリ outermost の画面の履歴（outermost が LIBRARY_HISTORY なら、書庫の履歴）の、戻せる（from が undo）かやり直せる（redo）最後の画面の履歴の段を捨てる。それが変えたほかのステージエントリの画面の履歴からも捨てる。
  // 画面の履歴の段を戻す・やり直すアクションが断られ、その段をもう置き直せないときに呼ぶ
  dropHistory(outermost: string, from: "undo" | "redo"): void
  // 同じ処理の中でこのあと行うアクションを、ステージエントリ outermost の最後の画面の履歴の段に足す（足して始めたその場の編集を確定するとき。足すのと書くのを 1 つの画面の履歴の段にする）。
  // 足すのは、そのステージエントリに最後に入れた画面の履歴の段が、そのステージエントリの最後の物のときだけ（元に戻す・やり直すのあとは足さずに、別の画面の履歴の段になる）。
  // 足したあと何も変わらなければ（足した物を書かずに消したなど）、その画面の履歴の段ごと無くなる
  continueStep(outermost: string): void
}

// 画面の操作のうち、ほかのスクリーン・ステージを id で名指す物と、開いた 1 枚の id を返す開き方。プラグイン API には出さない（土台と base の決まったファイルが、素の操作として使う）
export interface FrameActions {
  // スクリーンを 1 枚開いてカレントにし、開いた 1 枚の id を返す（開かなければ SCREEN_REFUSED）。ほかは openScreen と同じ
  openScreenId(def: string, props: unknown): string
  // ブックを窓に出し、出したステージの id を返す（無いブックなら何もせず NO_STAGE）。ほかは showBook と同じ
  showBookStage(book: string, page?: string): string
  makeScreenCurrent(id: string): void // 開いているスクリーン id をカレントスクリーンにする（見せるかはスクリーンアレンジメントが決める。退いた物の中は残す）
  showStage(id: string): void // ステージ id をカレントにし、それを並べているスクリーンをカレントスクリーンにする（そのステージを見せる）
  // ステージ stage をカレントにして右に何も開いていないステージを足し、足したステージの id を返す（足せなければ NO_STAGE）。ほかは split と同じ
  splitStage(stage: string): string
}

// 画面の操作のうち、場所（ステージの id。ダイアログとコマンドは、ステージを持たないスクリーンの id も）に向ける物。どれも第 1 引数が向ける場所。
// プラグインの見た目とコマンドには、描いている場所・呼ばれた場所に向けた形（BoundPlaceActions。第 1 引数が無い）で渡す
export interface PlaceActions {
  // そのステージから呼んだコマンドを行う。出ていない・押せないコマンドは行わず、行ったか返す
  command<Id extends CommandId>(stage: string, id: Id, ...args: CommandArgs<Id>): boolean
  // そのステージから開くダイアログを出す（出ていたものは閉じる）。値を渡すダイアログには、その値を渡す
  // ダイアログを開く。at は、開く場所: ステージの id か、開いているスクリーンの id（ステージを持たないスクリーンから開くとき）。どちらでもなければ開かない
  openDialog<Id extends DialogId>(at: string, id: Id, ...args: DialogArgs<Id>): void
  // 場所 from（ステージの id か、開いているスクリーンの id）で右クリックされた物 target のメニュー id を、画面の座標 at に出す（出ていたものは閉じる）
  openContextMenu(from: string, id: string, target: unknown, at: Point, opens?: MenuOpens): void
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
  // そのステージで選んでいる物を、その場で編集し始める（何の編集かの名前。kit.name で作る）・終える（"none"）
  setEditing(stage: string, editing: Editing): void
  // そのステージで道具のアイコンを、画面の座標 at（null なら画面が決める所）に開く（ほかのステージで開いていたものは閉じる）
  openPicker(stage: string, at: Point | null): void
  // at のスクリーン（スクリーンの id か、そのステージを並べるスクリーン）を閉じる（カレントスクリーンだったなら、1 つ前にカレントだった物がカレントになる）。
  // 最初から開いているスクリーンと、最後の 1 枚のブックスクリーンは閉じない
  closeScreen(at: string): void
  // at のスクリーンに渡す値を props に替える（スクリーンを積まず、ブラウザの履歴には積む。値は、そのスクリーンの定義の props の形。無いスクリーン・形に合わない値なら替えず false）
  setScreenProps(at: string, props: unknown): boolean
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
  closeScreen: true,
  setScreenProps: true,
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
  openScreen: () => false,
  showBook: () => false,
  setScreenArrangement: NOTHING,
  replaceHistory: NOTHING,
  moveDivider: NOTHING,
  evenDivider: NOTHING,
  requestPrint: NOTHING,
  requestBack: NOTHING,
  closePicker: NOTHING,
  moveHistory: NOTHING,
  dropHistory: NOTHING,
  continueStep: NOTHING,
}

// 画面の操作（store が持つ形。場所に向ける操作は、場所を第 1 引数に取る）
// アクションを行わずに確かめる操作。プラグイン API には出さない（base の元に戻す・やり直すが、store/commands/def.ts の tryPerformOf で読む）
export interface ProbeActions {
  // アクションを行わずに、今の状態で行ったらどうなるかの答えを返す（状態に入れず、ホストにも送らず、画面の履歴にも入れない。
  // 元に戻す・やり直すが、ぶつかって断られる画面の履歴の段を、置き直さずに確かめるのに使う）
  tryPerform<Id extends ActionId>(id: Id, ...args: PerformArgs<Id>): Performed<Id>
}

export interface Actions extends WindowActions, FrameActions, PlaceActions, ProbeActions {}

// 窓に向ける操作の名前（WindowActions に操作を足したら、ここにも書く。書き忘れは型の誤り）。プラグインに渡す操作は、store の操作からこれと場所に向ける物だけを選ぶ
export const WINDOW_ACTIONS: { readonly [K in keyof WindowActions]: true } = {
  perform: true,
  performConfirmed: true,
  closeDialog: true,
  previewDialog: true,
  submitDialog: true,
  pressKey: true,
  closeContextMenu: true,
  showToast: true,
  dismissToast: true,
  openScreen: true,
  showBook: true,
  setScreenArrangement: true,
  replaceHistory: true,
  moveDivider: true,
  evenDivider: true,
  requestPrint: true,
  requestBack: true,
  closePicker: true,
  moveHistory: true,
  dropHistory: true,
  continueStep: true,
}

// store の操作 actions の、窓に向ける物だけ（プラグインに渡す形。ほかを名指す操作 FrameActions を含めない）
export const windowActionsOf = (actions: WindowActions): WindowActions =>
  Object.fromEntries(
    Object.keys(WINDOW_ACTIONS).map(k => [k, (actions as unknown as Record<string, unknown>)[k]]),
  ) as unknown as WindowActions
