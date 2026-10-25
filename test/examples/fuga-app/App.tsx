// hoge を使わないアプリの見本: ビルトインプラグインと fuga だけで app を作る。hoge の型の書き足しはこのアプリに入らない
import { App, BUILTIN_UI, createMatomezu, DEFAULT_LAYOUT, defineLayout, MatomezuProvider } from "matomezu/testing"
import { FUGA_UI } from "../plugins/fuga/ui"

export const makeApp = () => createMatomezu({ plugins: [...BUILTIN_UI, FUGA_UI], home: "master", lang: "ja" })

export const FUGA_LAYOUT = defineLayout({
  ...DEFAULT_LAYOUT,
  id: "fuga",
  slots: { ...DEFAULT_LAYOUT.slots, "stage.top": [...DEFAULT_LAYOUT.slots["stage.top"], "fuga/mint-button"] },
})

export function FugaApp({ app }: { app: ReturnType<typeof makeApp> }) {
  return (
    <MatomezuProvider app={app} layout={FUGA_LAYOUT}>
      <App />
    </MatomezuProvider>
  )
}
