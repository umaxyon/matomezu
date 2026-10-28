// ホストクライアント: 画面がホスト（常駐サーバー）と外の世界に頼むこと（読む・行ったアクションを渡す・外の変化を受ける）を 1 つの型にまとめる。画面のコードは、この口からしか外に触らない。
// 実装はメモリに持つもの（memory.ts。テストとサーバーなし）と常駐に頼むもの（server.ts）
import type { Warning } from "../core/warnings"
import type { DoneAction, MatomezuInstance, TrashKeeper } from "../store/store"

// 起動のときに読むもの
export interface Loaded {
  books: readonly unknown[] // 残しておいたブック。形に合うかは store が確かめる（createMatomezu の savedBooks）
  settings: unknown // 残しておいた設定（無ければ undefined）。使える項目かは store が確かめる（createMatomezu の settings）
  plugins: readonly unknown[] // ホストが足した追加プラグイン（見た目を結んだもの）。プラグインかは組み立てが確かめる
  failed: readonly { id: string; error: unknown }[] // 読み込めなかった追加プラグインと理由（ほかのプラグインとブックは読む）
}

// ゴミ箱を変える頼み（restore・purge。createMatomezu の trash に渡す）も受ける
export interface HostClient extends TrashKeeper {
  load(): Promise<Loaded>
  observe(done: DoneAction): void // 画面で行ったアクション（createMatomezu の observe に渡す）
  connect(instance: MatomezuInstance): () => void // load で読んだもので作ったインスタンスとつなぐ（外の変化を入れ、残す）。切る関数を返す
  // 画面が見つけた warning（配置の W010・外した追加プラグインの W011 など）をホストに知らせる。前に知らせたものと入れ替え、
  // つなぎ直すたびに知らせ直す（ホストは窓ごとに持ち、ほかの warning と集めてログと AI に出す）
  reportWarnings(warnings: readonly Warning[]): void
}
