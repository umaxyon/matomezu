// 画面（Screen）を描くテストの共通の準備: インスタンスを組んで、Provider の中に Screen を描く。組んだインスタンスを返す
import { render } from "@testing-library/react"
import type { Book } from "../../web/src/core/schema/book"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import type { AnyPluginUi } from "../../web/src/ui/plugin"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"

export interface RenderOptions {
  plugins?: readonly AnyPluginUi[] // 既定はビルトインのプラグイン
  books?: readonly Book[] // 無ければブックを持たない
}

export function renderScreen(options: RenderOptions = {}) {
  const store = createMatomezu({
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
    plugins: options.plugins ?? BUILTIN_UI,
    ...(options.books ? { books: options.books } : {}),
    partial: true,
  })
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  return store
}
