// 開発者のアプリの見本: 中の部品と自分のプラグインで app を作り、自分のボタンから自分のコマンドを呼ぶ
import { BUILTIN_UI } from "../../../web/src/plugins/ui"
import { SAMPLE_BOOKS } from "../../../web/src/sample-books"
import { createMatomezu } from "../../../web/src/store/create"
import { App } from "../../../web/src/ui/App"
import { useCommand } from "../../../web/src/ui/commands"
import { MatomezuProvider } from "../../../web/src/ui/store-context"
import { HOGE_UI } from "./hoge-dialog/ui"

export const makeApp = () => createMatomezu({ plugins: [...BUILTIN_UI, HOGE_UI], books: SAMPLE_BOOKS })

function HogeButtons() {
  const open = useCommand("s1", "hoge/open")
  const greet = useCommand("s1", "hoge/greet")
  return (
    <>
      <button type="button" onClick={() => open.run()}>
        hoge
      </button>
      <button type="button" onClick={() => greet.run("en")}>
        english
      </button>
    </>
  )
}

export function HogeApp({ app }: { app: ReturnType<typeof makeApp> }) {
  return (
    <MatomezuProvider app={app}>
      <HogeButtons />
      <App />
    </MatomezuProvider>
  )
}
