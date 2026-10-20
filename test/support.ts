// テストで使う、中の部品だけの表と store
import { BUILTIN } from "../web/src/plugins"
import { SAMPLE_BOOKS } from "../web/src/sample-books"
import { assemble } from "../web/src/store/plugin"
import { createAppStore, type StoreOptions } from "../web/src/store/store"

export const REGISTRY = assemble(BUILTIN).registry
export const BUILTIN_PARTS = REGISTRY.parts

// 見本のブックを持ち、最初の 1 冊を開いた store
export const newStore = (options: Omit<StoreOptions, "plugins"> = {}) =>
  createAppStore({ plugins: BUILTIN, home: "master", books: SAMPLE_BOOKS, ...options })
