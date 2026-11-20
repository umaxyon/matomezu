// 画面の入口: ホストクライアント（ホストに頼むもの）から残したブックと設定を読み、ビルトインプラグインと見た目でインスタンスを作り、React の根に Screen を描く。行ったアクションと外の変化はホストクライアントを通してやり取りし、画面の場所は URL と行き来させる。
// 常駐につながらないときは、つながるまで待つ（起動の失敗なので画面には出さない）。描いて止める（ビルトインプラグインだけでインスタンスを作り、1 つの UI マッピングで描き、常駐ともブラウザの URL ともやり取りしない）のは 2 つのとき:
// 常駐がこのブラウザを知らないとき（ブックも設定も読まずに、開き方の案内）と、ホストが足した追加プラグインのどれかを組めないとき（知らせのつながりを閉じ、起動エラーの画面）。
// ホストが足した追加プラグインは、ホストクライアントが読んだものをビルトインプラグインの後ろに足す。追加プラグインが借りる実物（plugin-modules）は、読む前に globalThis.__matomezuModules に置く
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { fail } from "./core/errors"
import { followLocation } from "./host-client/location"
import { openClient } from "./host-client/open"
import { followPrint } from "./host-client/print"
import { pluginsNotAdded, pluginsNotAddedError } from "./host-client/startup-error"
import { browserWindowIo } from "./host-client/window-io"
import { UI_MODULES } from "./plugin-modules/ui"
import { BUILTIN_CONTROL_CENTER } from "./plugins"
import { BUILTIN_UI, DEFAULT_LAYOUT, STARTUP_ERROR_LAYOUT, UNKNOWN_BROWSER_LAYOUT } from "./plugins/ui"
import { createMatomezu } from "./store/create"
import type { StoreOptions } from "./store/store"
import { loadFonts } from "./ui/fonts"
import { type LayoutDef, placeAdded, placeAddedWithWarnings } from "./ui/layout"
import { type AnyPluginUi, assembleUi, withoutUi } from "./ui/plugin"
import { MatomezuProvider, shownLayout } from "./ui/store-context"
import { WindowRoot } from "./ui/WindowRoot"
import "./ui/skin.css"

loadFonts()
;(globalThis as { __matomezuModules?: unknown }).__matomezuModules = UI_MODULES
const root = document.getElementById("root")
if (!root) fail("E202")
const opened = await openClient()
const { client, loaded: saved } = opened.state === "opened" ? opened : await stopWith(root, UNKNOWN_BROWSER_LAYOUT)
const store = createMatomezu({
  plugins: BUILTIN_UI,
  controlCenter: BUILTIN_CONTROL_CENTER,
  savedBooks: saved.books,
  settings: saved.settings,
  lang: navigator.languages,
  observe: done => client.observe(done),
  aiEditTicket: change => client.reportAIEditTicket(change),
  visible: () => client.visible(),
  search: query => client.search(query),
  ...browserWindowIo(),
})
// 取り込んだ追加プラグインは、matomezu 本体の core/catalog.ts の型に入らないので、型では確かめず、台帳アセンブルで確かめる（見た目と、置いた UI マッピングも）。
// 読み込めないもの・台帳アセンブルで食い違うもの・UI マッピングが食い違うものが 1 つでもあれば、起動を止めて起動エラーの画面を出す
// 利用者が有効にしていない追加プラグインは、名乗りと文言だけで組む（ホストのエンジンも同じ。設定の「プラグイン」に並べる）
const offered = (saved.plugins as AnyPluginUi[]).map(p => (saved.disabled.includes(p.id) ? withoutUi(p) : p))
const notAdded = pluginsNotAdded(saved.failed, () =>
  store.use(offered, all => {
    shownLayout(placeAdded(DEFAULT_LAYOUT, all), all, assembleUi(all))
  }),
)
if (notAdded.length > 0) {
  for (const { name, reason } of notAdded) console.error(`plugin ${name} is not added:`, reason)
  client.closeEvents()
  await stopWith(root, STARTUP_ERROR_LAYOUT, {
    settings: saved.settings,
    startupError: pluginsNotAddedError(notAdded, ids => client.removeScreenPlugins(ids)),
  })
}
const placed = placeAddedWithWarnings(DEFAULT_LAYOUT, store.plugins)
const layout = placed.layout
// 画面が見つけた warning をホストに知らせる（ホストが集めてログと AI に出す）: 置く所が並びに無くて置かなかったウィジェット（W016）と、UI マッピングで飛ばした物（W010）
const screenWarnings = placed.warnings
client.reportWarnings([...screenWarnings, ...shownLayout(layout, store.plugins, assembleUi(store.plugins)).warnings])
client.connect(store)
// 窓を開いたときのアクション（窓の言語を、まだ選ばれていなければ設定に書くなど）を行う
store.startWindow()
// 画面の場所を URL と行き来させる（読み直しても同じ所が開き、ブラウザの戻る・進むで移動を戻る）
followLocation(store)
// 画面が頼んだら、ブラウザの印刷ダイアログで刷る
followPrint(store)

createRoot(root).render(
  <StrictMode>
    <MatomezuProvider instance={store} layout={layout} warnings={screenWarnings}>
      <WindowRoot />
    </MatomezuProvider>
  </StrictMode>,
)

// layout を描いて止める（戻らない）。ビルトインプラグインだけでインスタンスを作る。開き方の案内はブックも設定も読まない。
// 起動エラーの画面は、保存した設定（利用者が選んだ言語とスキン。追加プラグインの物なら、ビルトインの物に落ちる）と、出す物を extra で渡す。
// どちらもアクションを常駐に渡さず、warning も知らせない
async function stopWith(
  at: HTMLElement,
  layout: LayoutDef,
  extra: Pick<StoreOptions, "settings" | "startupError"> = {},
): Promise<never> {
  const stopped = createMatomezu({ plugins: BUILTIN_UI, lang: navigator.languages, ...browserWindowIo(), ...extra })
  createRoot(at).render(
    <StrictMode>
      <MatomezuProvider instance={stopped} layout={layout} warnings={[]}>
        <WindowRoot />
      </MatomezuProvider>
    </StrictMode>,
  )
  return new Promise<never>(() => {})
}
