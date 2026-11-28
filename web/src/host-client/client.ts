// ホストクライアント: 画面がホスト（常駐サーバー）とブラウザに頼むこと（読む・行ったアクションを渡す・外の変化を受ける）を 1 つの型にまとめる。画面のコードは、この口からしか外に触らない。
// 実装は常駐に頼むもの（server.ts）。テストはメモリに持つもの（test/host-client/memory.ts）を使う
import type { AssetPut } from "../core/assets"
import type { BROKEN } from "../core/folders"
import type { MovedIfOff, Purged, UnreadableNotice } from "../core/unreadable"
import type { Warning } from "../core/warnings"
import type { WideSearchAnswer, WideSearchQuery } from "../core/wide-search"
import type {
  AIEditTicketOutcome,
  DoneBulk,
  HostAnswer,
  HostRequest,
  LibraryRows,
  MatomezuInstance,
} from "../store/state"

// 起動のときに読むもの
export interface Loaded {
  saved: LibraryRows // 残しておいたページとフォルダの行。形に合うかは store が確かめる（createMatomezu の saved）
  settings: unknown // 残しておいた設定（無ければ undefined）。使える項目かは store が確かめる（createMatomezu の settings）
  plugins: readonly unknown[] // ホストが足した追加プラグイン（見た目を結んだもの）。プラグインかは台帳アセンブルが確かめる
  failed: readonly { id: string; error: unknown }[] // 読み込めなかった追加プラグインと理由（ほかのプラグインとブックは読む）
  disabled: readonly string[] // 利用者が有効にしていない追加プラグインの id（名乗りと文言だけで組む）
  // 読み直す前の窓に知らされた、読めない物のフォルダへ移った・戻った物（その窓が自分で無効にして移した物は除く）。無ければ持たない
  unreadableNotice?: UnreadableNotice
}

export interface HostClient {
  load(): Promise<Loaded>
  observe(bulk: DoneBulk): Promise<HostAnswer> // 画面で行ったアクションバルクを渡し、ホストが確かめた答えを待つ（createMatomezu の observe に渡す）
  connect(instance: MatomezuInstance): () => void // load で読んだもので作ったインスタンスとつなぐ（外の変化を入れ、残す）。切る関数を返す
  // 画面が見つけた warning（UI マッピングの W010・置かなかったウィジェットの W016 など）をホストに知らせる。前に知らせたものと入れ替え、
  // つなぎ直すたびに知らせ直す（ホストは窓ごとに持ち、ほかの warning と集めてログと AI に出す）
  reportWarnings(warnings: readonly Warning[]): void
  // まだ見ていない AI の変更が、この窓で見えたか、見られる前に消えたこと（createMatomezu の aiEditTicket に渡す）。ホストは AI の変更ごとに残し、消えた物を AI に渡す
  reportAIEditTicket(change: AIEditTicketOutcome): void
  // ホストの言葉の検索（横断検索）。断られた・つながらなかったときは投げる。画面には createMatomezu の search で渡す
  search(query: WideSearchQuery): Promise<WideSearchAnswer>
  // 画像のバイト列を、アセットの置き場に置く（POST /api/assets）。受けなければ訳を返す。常駐が断るか（200 でない）つながらなければ E417 を投げる。画面には createMatomezu の assetsHost で渡す
  putAsset(bytes: Blob): Promise<AssetPut>
  // アセット id の中身を読む URL（GET /api/assets/{id}）
  assetUrl(id: string): string
  // load が開いた知らせのつながりを閉じる（起動を止めた窓が connect の前に呼ぶ）。常駐はこの窓を、AI の view・show の向け先に数えなくなる。
  // 閉じたあとは「plugins」の知らせでも読み直さない。removeScreenPlugins は閉じたあとも使える
  closeEvents(): void
  // 窓が組み込めなかった追加プラグイン ids を、並びの順にホストから外す（AI から外すのと同じ）。全部外せたら窓を読み直して removed、
  // 外せなかった物があれば、その id と理由で止めて refused（それより前の物は外れたまま）、常駐につながらなければ unreachable。常駐が断れば（200 でない）E405 を投げる
  removeScreenPlugins(ids: readonly string[]): Promise<ScreenPluginsRemoved>
  // 読めない物のフォルダの直下の物 id を完全に消すのを頼む（変わった行は知らせで入る）。常駐が断るか（200 でない）つながらなければ E407 を投げる
  purgeUnreadable(id: string): Promise<Purged>
  // 追加プラグイン ids を無効にしたら読めない物のフォルダへ移る物を、書かずに数えてもらう。常駐が断るか（200 でない）つながらなければ E408 を投げる
  movedIfOff(ids: readonly string[]): Promise<readonly MovedIfOff[] | typeof BROKEN>
  // 新しい版を今確かめるのを頼む（結果は知らせでも入る）。常駐が断るか（200 でない）つながらなければ E410 を投げる
  checkUpdate(): Promise<void>
  // ワークルーム workroom（id）の AI に、版を上げるよう頼む（起こす知らせ）。そこに参加の確定した AI がいなければ false。常駐が断るか（200 でない）つながらなければ E411 を投げる
  askUpdate(workroom: string): Promise<boolean>
  // 参加者 participant（ワークルームの AI）に、切りのよい所で引継ぎページを書いて会話を空にするよう頼む（起こす知らせ）。
  // その参加者がワークルームの AI でないか、会話を空にできると名乗っていなければ false。常駐が断るか（200 でない）つながらなければ E419 を投げる
  askRefresh(participant: string): Promise<boolean>
  // ほかのホストについて頼む（様子は知らせで入る）。常駐が断るか（200 でない）つながらなければ E413 を投げる
  askHosts(request: HostRequest): Promise<void>
  // 承認待ちの AI 間メッセージに、承認（approve）かキャンセル（cancel）を頼む（答えは知らせでも入る）。not-pending で断られても投げない（もう承認待ちでない）。常駐が断るか（200 でない）つながらなければ E415 を投げる
  answerMessage(id: string, answer: "approve" | "cancel"): Promise<void>
  visible(): boolean // 窓が見えているか（裏のタブなどで見えていない間は、まだ見ていない変更を見えたとしない。createMatomezu の visible に渡す）
}

// removeScreenPlugins の答え
export type ScreenPluginsRemoved =
  | { state: "removed" }
  | { state: "refused"; id: string; reason: string }
  | { state: "unreachable" }
