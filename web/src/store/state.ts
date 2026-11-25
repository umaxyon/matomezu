// 画面の状態とインスタンスの形: store が持つ状態・インスタンスとそれを作るときに渡す物・ホストとやり取りする形と、最初の状態を組む関数

import type { StoreApi } from "zustand/vanilla"
import type { Address } from "../core/address"
import type { Annotations } from "../core/annotation"
import type { ControlCenterId, MessageKey, SkinId } from "../core/catalog"
import type { CoreCatalog } from "../core/core-catalog"
import type { ActionOn } from "../core/def/action"
import type { BROKEN, Folders, Library, Pages } from "../core/folders"
import type { UnreadableItem } from "../core/folders-unreadable"
import type { History } from "../core/history"
import type { Lang, Params } from "../core/i18n/i18n"
import { type Books, splitTrash } from "../core/library"
import type { Written } from "../core/patch"
import type { Counters, Records } from "../core/records"
import type { Book } from "../core/schema/book"
import type { Settings } from "../core/settings"
import type { MovedIfOff, Purged, UnreadableNotice } from "../core/unreadable"
import type { Warning } from "../core/warnings"
import type { WideSearchAnswer, WideSearchQuery } from "../core/wide-search"
import { newWindow, type WindowState } from "../core/window"
import type { Actions } from "./actions"
import type { OpenedContextMenu } from "./context-menus"
import type { OpenedDialog } from "./dialogs"
import type { KeyTable } from "./keys"
import type { Assembled, Plugin } from "./plugin"
import { NO_PLUGIN_STATES, type PluginPlace, type PluginValues } from "./plugin-state"

export interface MatomezuState {
  // ページの表とフォルダの表（core/folders.ts。ゴミ箱のブックの分も）。ブックのデータは、この 2 つが持つ。books と trash は、ここから組んだ値で、表を変える所で一緒に入れ直す
  pages: Pages
  folders: Folders
  books: Readonly<Record<string, Book>> // ブックの id ごと（ゴミ箱のブックは除く。表から組んだ値）
  unreadable: readonly Warning[] // 残したブックのうち、ブックごと読めないもの（warning W005・W006・読めないページを持つ W027〜W029。データには手を付けず、開けない）
  partial: readonly Warning[] // 読めるブックの、機能台帳に無いアイテムや設定の項目（W007）。無い物はそのまま残す
  unreadableFolder: readonly UnreadableItem[] // 読めない物のフォルダの直下の物（並びの順。ホストから受け取った行から。書庫には入らない）
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
  trash: Readonly<Record<string, Book>> // ゴミ箱かその中のブックの id ごと
  offline: boolean // 常駐とのつながりが、しばらく切れたままか（ホストクライアントが知らせる）
  // つなぎ直した常駐が、窓を開いたときと別の版か（ホストクライアントが知らせる。無ければ null）。データの形が違えば、アクションもキーも断る
  staleBuild: StaleBuild | null
  updateStatus: UpdateStatus | null // 新しい版の確かめの結果（常駐だけが持つ。ホストクライアントが知らせる。無ければ null）
  hostStatus: HostStatus | null // ホストどうしの入口の様子（常駐だけが持つ。ホストクライアントが知らせる。無ければ null）
  hostPeers: HostPeers | null // ほかのホストの様子（常駐だけが持つ。ホストクライアントが知らせる。無ければ null）
  lastWindow: boolean // この窓が、最後にフォーカスされた窓か（ホストクライアントが、常駐のレコードの知らせに添えられた値で入れる）
  // ステージエントリの id → 画面の履歴（この画面で利用者が行ったアクションだけ。読み直すと消える）。画面の履歴の段がいくつかのステージエントリを変えたら、その全部に同じ画面の履歴の段が入る
  history: Readonly<Record<string, History>>
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

// 新しい版の確かめの結果: state は unchecked（まだ）・current（今の版が一番新しい）・newer（新しい版 latest がある）・dev（開発の版なので確かめない）。
// checkedAt は最後に聞けた時刻、askedAt は管理者に更新を頼んだ時刻（ISO 8601 の UTC）
export interface UpdateStatus {
  state: "unchecked" | "current" | "newer" | "dev"
  version: string
  latest?: string
  checkedAt?: string
  askedAt?: string
}

// ホストどうしの入口の様子: hostId はこのホストの id（鍵の指紋）、name はホスト名（設定か、無ければ OS のホスト名 osHostName）、
// open は入口が開いているか（port と、待っている所の番地 addrs）、wsl は WSL で動いているか、failed は開こうとして開けなかったときの理由
// （port-in-use は覚えたポート port がほかに使われていた、listen はそのほか。覚えたポートは取り直さない。足してもらったファイアウォールの規則や相手が覚えた番号を壊さないため）
export interface HostStatus {
  hostId: string
  name: string
  osHostName: string
  open: boolean
  port?: number
  addrs?: readonly string[]
  wsl?: boolean
  failed?: "port-in-use" | "listen"
}

// ペアリングしたホストの、常駐だけが持つ様子: state はつながりの様子（確かめた時点で）、lastSeen は最後につながった時刻、addr は待っている所（番地:ポート）、
// route はつながっている道（つながっているときだけ。direct はこちらから相手の待っている所へ届く、reverse は相手が張ったリバース接続でだけつながっている）、
// name と userName は相手の今のホスト名と利用者名（つながったときに聞いた物）、
// label はホストエイリアス（常駐が決める。同じ名前のホストがあれば鍵の印の頭（違うまで伸ばす）を添える）、workrooms は相手のワークルームの一覧の写し（つながっていて写しのあるときだけ）
export interface PeerLive {
  hostId: string
  label: string
  state: "connected" | "unreachable" | "key-mismatch" | "update-this" | "update-that"
  workrooms?: readonly { name: string; activity: "working" | "idle" | "unknown" }[]
  lastSeen?: string
  addr?: string
  route?: "direct" | "reverse"
  name?: string
  userName?: string
}

// mDNS で見つけた、ペアリングしていないホスト（相手が名乗ったまま）。addr は待っている所（番地:ポート）
export interface FoundHost {
  hostId: string
  name: string
  userName: string
  addr: string
}

// このホストが頼んでいるペアリングの様子: asking は相手に届けている所、waiting は相手の利用者の答えを待っている所（code は接続確認コード）、
// accepted・declined・timed-out は相手の答え、unreachable は届かなかった、refused は相手が受けなかった（reason は相手の理由。self は自分自身）、key-mismatch は 2 回目で鍵が変わった
export interface HostPairing {
  phase: "asking" | "waiting" | "accepted" | "declined" | "timed-out" | "unreachable" | "refused" | "key-mismatch"
  addr: string
  hostId?: string
  name?: string
  userName?: string
  code?: string
  reason?: string
}

// ほかのホストの様子（常駐だけが持つ）: ペアリングしたホストの様子・mDNS で見つけたホスト・頼んでいるペアリング
export interface HostPeers {
  paired: readonly PeerLive[]
  found: readonly FoundHost[]
  pairing?: HostPairing
}

// ほかのホストについてホストに頼む事: pair は addr（番地:ポート）のホストにペアリングを頼む（manual は利用者が手で入れたか）、end-pairing は頼んでいるのをやめる（終わった様子も消す）、
// check はペアリングしたホストとつながっているか確かめる、discover は mDNS で今すぐ問う、repick-port は覚えたポートが使われているとき別の番号で開き直す
export type HostRequest =
  | { kind: "pair"; addr: string; manual: boolean }
  | { kind: "end-pairing" }
  | { kind: "check" }
  | { kind: "discover" }
  | { kind: "repick-port" }

// 常駐の版とデータの形の番号（移し替えの数）
export interface Build {
  version: string
  dataVersion: number
}
// 窓を開いたときの常駐（from）と、つなぎ直したときの常駐（to）。dropped は、データの形が違うので送らずに捨てた、まだ確かめられていなかったアクションバルクの数
export interface StaleBuild {
  from: Build
  to: Build
  dropped: number
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

// この窓のでない変更（AI・ほかの窓・ホスト）の知らせ: act は常駐がその 1 回に振った印、actions は行ったアクションの id、
// library は、書庫の履歴に入るアクションが変えたページとフォルダごとの、前と後（置き場所の形のまま。無い側は none。無ければ持たない）
export interface ForeignChange {
  by: "ai" | "window" | "host"
  act: string
  actions: readonly string[]
  library?: ForeignLibraryRows
}
// ページ・フォルダ 1 つの、前と後（常駐が知らせた値。無い側は none）
export type RowSides = { before?: unknown; after?: unknown }
export interface ForeignLibraryRows {
  pages: Readonly<Record<string, RowSides>>
  folders: Readonly<Record<string, RowSides>>
}

// 画面で行ったアクション 1 つ（ホストが常駐に送り、行い直しに使う）。ids は行ったときに振った id の順、lang はそのときの言語
export interface DoneAction {
  action: string
  args: unknown
  on?: ActionOn
  ids: readonly string[]
  lang: Lang
  now: string // 行った時点（ActionContext の now）
  today: string // 行った日付（ActionContext の today。now と同じ時点の、画面の暦の日付）
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
    world: LibraryRows & {
      // pages と folders は、置き場所から読んだままのページとフォルダ（書庫は、ここから読んで確かめる）
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
    change?: ForeignChange,
  ): void
  // まだ見ていない画面の履歴の段が見えたかを確かめ直す（窓が見えるようになったとき。ホストクライアントだけが使う。プラグインに渡す actions には入れない）
  checkSeen(): void
  // ホストの言葉の検索（横断検索）。base のフック useWideSearch を通して使う（プラグインに渡す actions には入れない）。
  // ホストが無いか、頼めなければ、投げる（検索の見た目が受ける）
  search(query: WideSearchQuery): Promise<WideSearchAnswer>
  // ブラウザのクリップボードに文字を書く。base のフック useCopyText を通して使う（プラグインに渡す actions には入れない）。書けなければ投げる
  copyText(text: string): Promise<void>
  // 利用者が端末で打つ matomezu の名前（Windows で npm の .cmd なら matomezu.cmd）。base のフック useMatomezuCommand を通して使う（プラグインに渡す actions には入れない）
  readonly command: string
  // 読めない物のフォルダの直下の物 id を完全に消すのをホストに頼む（アクションでなく、画面の履歴に入らない。変わった行はホストの知らせで入る）。
  // base のフックを通して使う（プラグインに渡す actions には入れない）。ホストが無いか、頼めなければ投げる
  purgeUnreadable(id: string): Promise<Purged>
  // 追加プラグイン ids を無効にしたら読めない物のフォルダへ移る物を、ホストに書かずに数えてもらう（BROKEN なら、読めない物のフォルダの行が形に合わず、何も移らない）。
  // base のフックを通して使う（プラグインに渡す actions には入れない）。ホストが無いか、頼めなければ投げる
  movedIfOff(ids: readonly string[]): Promise<readonly MovedIfOff[] | typeof BROKEN>
  // 窓のタイトル（ブラウザのタブとタイトルバーに出る文字）を替える。base のフック useWindowTitle を通して使う（プラグインに渡す actions には入れない）
  setWindowTitle(title: string): void
  // 今の窓のタイトル（替えたあとで戻すため）。口が無ければ空
  windowTitle(): string
  // 窓を開く前に知らされた、読めない物のフォルダへ移った・戻った物（作ったときに渡したもの。無ければ持たない）。base のフックを通して、窓を開いたあと 1 回知らせる
  unreadableNotice?: UnreadableNotice
  // 起動エラーの画面に出す物（作ったときに渡したもの。起動を止めた窓のほかは無い）。base のフック useStartupError を通して使う
  startupError?: StartupError
  // 今の画面の場所（開いているブック・ページ・倍率・ずらす量・分割と、画面の場所に入れるプラグイン状態。core/address.ts・plugin-state.ts）。ホストクライアントだけが使う
  address(): Address
  // 画面の場所を address にする（core/address.ts の placeAt と、画面の場所に入れるプラグイン状態）。
  // ホストクライアントだけが使う（ブラウザの URL などの外から戻すとき。プラグインに渡す actions には入れない）
  locate(address: Address): void
  // 窓を開いて常駐につながったときに 1 度、窓を開いたときのアクション（ActionDef の runsAtWindowStart）を、それが窓から決まる事で答えた引数で、利用者として行う
  // （それで変わったデータに合わせて足す物は、常駐が足す）。画面の入口が、ホストクライアントの connect のあとに呼ぶ（プラグインに渡す actions には入れない）
  startWindow(): void
  // 常駐とのつながりが、しばらく切れたままか（offline）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setOffline(offline: boolean): void
  // つなぎ直した常駐が別の版か（staleBuild）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setStaleBuild(stale: StaleBuild): void
  // 新しい版の確かめの結果（updateStatus）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setUpdateStatus(status: UpdateStatus): void
  // ホストどうしの入口の様子（hostStatus）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setHostStatus(status: HostStatus): void
  // ほかのホストの様子（hostPeers）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setHostPeers(peers: HostPeers): void
  // ほかのホストについてホストに頼む（様子はホストの知らせで入る）。base のフックを通して使う。ホストが無いか、頼めなければ投げる
  askHosts(request: HostRequest): Promise<void>
  // 新しい版を今確かめるのをホストに頼む（結果はホストの知らせで入る）。base のフックを通して使う。ホストが無いか、頼めなければ投げる
  checkUpdate(): Promise<void>
  // ワークルーム workroom（id）の AI に、版を上げるよう頼むのをホストに頼む。そこに参加の確定した AI がいなければ false。base のフックを通して使う。ホストが無いか、頼めなければ投げる
  askUpdate(workroom: string): Promise<boolean>
  // 窓を読み込み直す（画面の場所は URL に残る）
  reloadWindow(): void
  // この窓が、最後にフォーカスされた窓か（lastWindow）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setLastWindow(last: boolean): void
  // この窓の中に戻る先があるか（canGoBack）を入れる。ホストクライアントだけが使う（プラグインに渡す actions には入れない）
  setCanGoBack(can: boolean): void
  // 今の利用者の設定でのキーバインドの表（作り直すのは利用者の変更が変わったときだけ。画面がキーの名前を出すのに使う）
  keys(): KeyTable
  // プラグイン状態の宣言 id の値を value にする（undefined なら消す）。場所 at は、窓の範囲の宣言なら WINDOW_PLACE、ステージごとの宣言ならステージの id、スクリーンごとの宣言ならスクリーンの id。知らない id は E122、範囲が合わなければ E124、画面の場所に入れる宣言の形に合わない値は E123。
  // プラグインは、自分の kit と宣言を渡すフックを通して、自分の宣言だけを変える（プラグインに渡す actions には入れない）
  setPluginState(id: string, at: PluginPlace, value: unknown): void
  // ほかのプラグインの宣言に値を入れる道: 画面の場所に入れる宣言（address を持つ）の id と値だけで、宣言の形で確かめて入れる。入れたら true。
  // 宣言が無い・address が無い・形に合わない値・場所の無い範囲（ステージの宣言でステージを渡さない・開いていないスクリーン）は、何もせず false。
  // ステージの宣言は caller.stage のステージの値、窓の宣言は窓の値。スクリーンの宣言は、caller.screenDef（書き先のスクリーンの定義の id）の開いているスクリーン（複数なら最後にカレントにした 1 枚）の値、
  // screenDef を渡さなければ caller.screen（呼んだビューがいるスクリーン）の値（窓のカレントスクリーンには落とさない）。同じ値なら何も変わらない（ブラウザの履歴に積まない）。
  // ifNow を渡すと、その場所の今の値（無ければ宣言の既定）が ifNow と同じときだけ入れる（違えば何もせず false。base だけが使い、プラグイン API には出さない）
  setPluginStateById(
    id: string,
    value: unknown,
    caller: { screen?: string; screenDef?: string; stage?: string; ifNow?: { value: unknown } },
  ): boolean
  // 複数の値をまとめて書く（store には 1 回で書く。途中の、片方だけ変わった状態を知らせない）。1 つでも知らない id・範囲違い・形違いがあれば、何も書かずに error
  setPluginStates(changes: readonly (readonly [id: string, at: PluginPlace, value: unknown])[]): void
  // ブラウザの履歴に積むと宣言した宣言の id の組（今の台帳のもの。追加プラグインを取り込んだら変わる。ホストクライアントが、画面の場所が移動したかを決めるのに使う）
  pushing(): ReadonlySet<string>
  // 鍵 key の編集ロックを lock にする（null なら外す）。base のフック useEditLock を通して使う（プラグインに渡す actions には入れない）
  setEditLock(key: string, lock: EditLock | null): void
  // 取り込んだ追加プラグイン added を足して組み直す（前に足したものと置き換える）。状態は作ったときの初めに戻し、最後に読んだ行（作ったときの行か、そのあと受けた行）を新しい台帳で読み直す。
  // 追加プラグインは並びの順に 1 つずつ試し、台帳アセンブルで食い違う物（check が投げたものも）は、そのあとを試す台帳に入れない。
  // 1 つでも食い違えば、何も当てずに（前の台帳のまま）E317 を投げる。details は食い違った物ごとの E318（並びの順。plugin は id、reason は中の error の文）
  use(added: readonly Plugin[], check?: (plugins: readonly Plugin[]) => void): void
}

// 置き場所から読んだままのページとフォルダの行（形を確かめる前の値）
export interface LibraryRows {
  pages: readonly unknown[]
  folders: readonly unknown[]
}

// 行を今の機能台帳で読んだ物: 書庫の表 library と、読めないブックの warning・読めるブックの中の問題（core/book.ts の readLibrary）と、読めない物のフォルダの直下の物
export interface LibraryLoaded {
  library: Library
  warnings: readonly Warning[]
  partial: readonly Warning[]
  unreadableFolder: readonly UnreadableItem[]
}

// 最初の状態（ブックスクリーンは開かない）。書庫は、行を読んだ物 loaded
export function initialState(
  booksAndTrashOf: (tables: Library) => BooksAndTrash,
  catalog: CoreCatalog,
  loaded: LibraryLoaded,
  settings: Settings,
  lang: Lang,
): MatomezuState {
  const tables = loaded.library
  const { books: open, trash } = booksAndTrashOf(tables)
  return {
    ...tables,
    books: open,
    unreadable: loaded.warnings,
    partial: loaded.partial,
    unreadableFolder: loaded.unreadableFolder,
    window: newWindow(catalog),
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
    staleBuild: null,
    updateStatus: null,
    hostStatus: null,
    hostPeers: null,
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

// まだ見ていない AI の変更（act は常駐の changed の知らせの印。places は、その変更が変えた・足した・無くしたページとフォルダの id）が、この窓で見えた（seen）か、
// 見られる前に消えた（lost。ステージエントリ entry の分で、places はその中の物、lost は消えた所と AI が書いた値）
export type AIEditTicketOutcome =
  | { act: string; places: readonly string[]; outcome: "seen" }
  | { entry: string; act: string; places: readonly string[]; outcome: "lost"; lost: readonly LostValue[] }
// 見られる前に消えた所と値 1 つ: entry はページ・ブック・バインダの id、at はその行の中の道
export type LostValue = { entry: string } & Written

// 起動エラーの画面に出す物: 画面が起動を止めた理由の種類（kind。base の文言を引く）、原因の一覧と、直す手（ボタン）。
// 種類ごとに、画面の入口が作って createMatomezu に渡す（起動エラーの画面のほかは描かない窓）
export type StartupErrorKind = "plugins-not-added" // 追加プラグインのどれかを組めない
export interface StartupCause {
  name: string // 原因の名前（追加プラグインの id など）
  reason: string // 理由の文（作り手向けの error の文のまま）
}
// 直す手を行った結果: fixed は直せた（窓を読み直すので、もう押せない）、refused は断られた理由の文と残りの原因、unreachable は常駐につながらない（原因はそのまま）
export type StartupFixOutcome =
  | { state: "fixed" }
  | { state: "refused"; reason: string; causes: readonly StartupCause[] }
  | { state: "unreachable" }
export interface StartupError {
  kind: StartupErrorKind
  causes: readonly StartupCause[]
  fix: (causes: readonly StartupCause[]) => Promise<StartupFixOutcome> // 直す手。今出している原因の一覧を渡す
}

export interface StoreOptions<Ps extends readonly Plugin[] = readonly Plugin[]> {
  plugins: Ps
  controlCenter?: ControlCenterId // コントロールセンターの定義の id。ブックの一覧・利用者の設定・対象の定義の種類を変えるアクションを許すかはこれが決める。無ければ、それらは断る
  books?: readonly Book[] // 最初に持つブック（開かない）
  autoSkin?: { light?: SkinId; dark?: SkinId } // 自動のスキン（OS の明暗に合わせる）で使うスキン。無ければ、表で最初に出てくるその明暗のスキン
  lang?: Lang | readonly string[] // 言語か、好む言語の並び（ブラウザの言語など）。インスタンスにある最初の言語を使い、無ければ英語
  saved?: LibraryRows // 残しておいたページとフォルダの行（ホストが読んだもの）。books の行と合わせて、今の機能台帳で読んだ書庫を持つ
  settings?: unknown // 残しておいた設定（ホストが読んだもの）。言語の項目が選んだ言語パックは、lang より優先して使う
  initial?: MatomezuState // 最初の状態をそのまま渡す（books と lang より優先する）
  newId?: () => string // ブック・ページ・アイテムの id のもとを振る。無ければ、どの世界でも重ならない uuid
  now?: () => string // アクションを行う時点（UTC の ISO 8601）を決める。無ければ今の時刻
  // アクションバルクを閉じたときに、行えたアクションの並びを知らせる（行い直しは知らせない）。ホストが確かめた答えを返せば、断られたアクションバルクの画面の履歴の段を捨てる
  observe?: (bulk: DoneBulk) => Promise<HostAnswer> | undefined
  aiEditTicket?: (change: AIEditTicketOutcome) => void // まだ見ていない AI の変更が、この窓で見えたか、見られる前に画面の履歴に入らない変更（ゴミ箱から消すなど）で消えたときに知らせる
  visible?: () => boolean // 窓が見えているか（裏のタブなどで見えていない間は、まだ見ていない変更を見えたとしない。無ければいつも見えている）
  search?: (query: WideSearchQuery) => Promise<WideSearchAnswer> // ホストの言葉の検索（横断検索）。無ければ、どの言葉にも横断検索の当たりなし
  copyText?: (text: string) => Promise<void> // ブラウザのクリップボードに文字を書く。無ければ、書けないとして投げる（E404）
  command?: string // 利用者が端末で打つ matomezu の名前。無ければ matomezu
  // 新しい版を確かめる・ワークルームの AI に更新を頼むのをホストに頼む口。無ければ、頼むと投げる（E409）
  updateHost?: { check(): Promise<void>; ask(workroom: string): Promise<boolean> }
  // ほかのホストについてホストに頼む口。無ければ、頼むと投げる（E412）
  hostsHost?: { ask(request: HostRequest): Promise<void> }
  // 読めない物のフォルダについてホストに頼む口（完全に消す・無効にしたら移る物を数える）。無ければ、頼むと投げる（E406）
  unreadableHost?: {
    purge(id: string): Promise<Purged>
    movedIfOff(ids: readonly string[]): Promise<readonly MovedIfOff[] | typeof BROKEN>
  }
  setWindowTitle?: (title: string) => void // 窓のタイトルを替える。無ければ何もしない
  reloadWindow?: () => void // 窓を読み込み直す。無ければ何もしない
  windowTitle?: () => string // 今の窓のタイトル。無ければ空
  startupError?: StartupError // 起動エラーの画面に出す物（起動を止めた窓だけが渡す）
  unreadableNotice?: UnreadableNotice // 窓を開く前に知らされた、読めない物のフォルダへ移った・戻った物（ホストクライアントが運んだ物）
}

export type BooksAndTrash = { books: Books; trash: Books }

// 表 tables から、開けるブックとゴミ箱のブックを組む関数を作る（インスタンスごとに 1 つ。中のブックがその関数で前に組んだ物と全部同じなら、前と同じ値を返す）
export function booksAndTrashMaker(): (tables: Library) => BooksAndTrash {
  let last: BooksAndTrash = { books: {}, trash: {} }
  const same = (a: Books, b: Books) =>
    Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([id, book]) => b[id] === book)
  return tables => {
    const split = splitTrash(tables)
    last = {
      books: same(split.books, last.books) ? last.books : split.books,
      trash: same(split.trash, last.trash) ? last.trash : split.trash,
    }
    return last
  }
}
