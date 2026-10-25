// ホストクライアント: 画面がホスト（常駐サーバー）と外の世界に頼むこと（読む・行ったアクションを渡す・外の変化を受ける）を 1 つの型にまとめる。画面のコードは、この口からしか外に触らない。
// 実装はメモリに持つもの（memory.ts。テストとサーバーなし）と常駐に頼むもの（server.ts）
import type { AppStore, DoneAction } from "../store/store"

// 起動のときに読むもの
export interface Loaded {
  books: readonly unknown[] // 残しておいたブック。形に合うかは store が確かめる（createMatomezu の savedBooks）
  settings: unknown // 残しておいた設定（無ければ undefined）。使える項目かは store が確かめる（createMatomezu の settings）
}

export interface HostClient {
  load(): Promise<Loaded>
  observe(done: DoneAction): void // 画面で行ったアクション（createMatomezu の observe に渡す）
  connect(app: AppStore): () => void // load で読んだもので作ったインスタンスとつなぐ（外の変化を入れ、残す）。切る関数を返す
}
