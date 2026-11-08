// テストで使う、ビルトインプラグインだけの表と store
import { BUILTIN } from "../web/src/plugins"
import { assemble } from "../web/src/store/plugin"
import { createMatomezuInstance, type StoreOptions } from "../web/src/store/store"
import { SAMPLE_BOOKS } from "./sample-books"

export const CORE_CATALOG = assemble(BUILTIN).catalog.core
export const BUILTIN_PARTS = CORE_CATALOG.parts

// 順に n1, n2, … を返す newId（振った id を読みやすく、決まった値にする）
export function sequence(prefix = "n"): () => string {
  let n = 0
  return () => `${prefix}${++n}`
}

// 見本のブックを持ち、最初の 1 冊を開いた store。id は n1, n2, … の順に振る
export const newStore = (options: Omit<StoreOptions, "plugins"> = {}) =>
  createMatomezuInstance({
    plugins: BUILTIN,
    controlCenter: "@matomezu/control-center:control-center",
    books: SAMPLE_BOOKS,
    lang: "ja",
    newId: sequence(),
    ...options,
  })

// 画面の大きさを決めた store（ステージ s1 が 1400×1000。紙に形を置くテストの準備）
export function sizedStore(options: Omit<StoreOptions, "plugins"> = {}) {
  const store = newStore(options)
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
