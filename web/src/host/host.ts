// ホストの口: 画面が外の世界に頼むこと（読む・残す）を 1 つの型にまとめる。画面のコードは、この口からしか外に触らない。
// 実装はメモリに持つもの（memory.ts。テストとサーバーなし）とサーバーに頼むもの（server.ts）
import type { Book } from "../core/schema/book"
import type { Settings } from "../core/settings"

// 起動のときに読むもの
export interface Loaded {
  books: readonly unknown[] // 残しておいたブック。形に合うかは store が確かめる（createMatomezu の savedBooks）
  settings: unknown // 残しておいた設定（無ければ undefined）。使える項目かは store が確かめる（createMatomezu の settings）
}

export interface Host {
  load(): Promise<Loaded>
  saveBook(book: Book): void // 変わったブックを残す（いつ書くかはホストが決める）
  saveSettings(settings: Settings): void
}
