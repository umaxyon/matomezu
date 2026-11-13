// 画面（Screen）を描くテストの共通の準備: インスタンスを組んで、Provider の中に Screen を描く。組んだインスタンスを返す
import { render } from "@testing-library/react"
import type { Book } from "../../web/src/core/schema/book"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import type { AnyPluginUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { WindowRoot } from "../../web/src/ui/WindowRoot"

export interface RenderOptions {
  plugins?: readonly AnyPluginUi[] // 既定はビルトインのプラグイン
  books?: readonly Book[] // 無ければブックを持たない
}

// ほかのプラグインを足す・外すとき（plugins を渡すとき）は partial: true。渡さなければ、ビルトインを全部渡すので、型の確かめが効く
export function renderScreen(options: RenderOptions = {}) {
  const base = {
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    ...(options.books ? { books: options.books } : {}),
  } as const
  const store = options.plugins
    ? createMatomezu({ ...base, plugins: options.plugins, partial: true })
    : createMatomezu({ ...base, plugins: BUILTIN_UI })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <WindowRoot />
    </MatomezuProvider>,
  )
  return store
}
