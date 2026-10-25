// テストで使う、ビルトインプラグインだけの表と store
import { BUILTIN } from "../web/src/plugins"
import { SAMPLE_BOOKS } from "../web/src/sample-books"
import { assemble } from "../web/src/store/plugin"
import { createAppStore, type StoreOptions } from "../web/src/store/store"

export const REGISTRY = assemble(BUILTIN).registry
export const BUILTIN_PARTS = REGISTRY.parts

// 順に n1, n2, … を返す newId（振った id を読みやすく、決まった値にする）
export function sequence(prefix = "n"): () => string {
  let n = 0
  return () => `${prefix}${++n}`
}

// 見本のブックを持ち、最初の 1 冊を開いた store。id は n1, n2, … の順に振る
export const newStore = (options: Omit<StoreOptions, "plugins"> = {}) =>
  createAppStore({ plugins: BUILTIN, home: "master", books: SAMPLE_BOOKS, lang: "ja", newId: sequence(), ...options })
