// hoge のボタン（ウィジェット hoge/buttons）: そのステージから hoge のコマンドを呼ぶ
import { useCommand, useT } from "matomezu/ui"

export function HogeButtons({ stage }: { stage: string }) {
  const open = useCommand(stage, "hoge/open")
  const greet = useCommand(stage, "hoge/greet")
  const t = useT()
  return (
    <div>
      <button type="button" onClick={() => open.run()}>
        {t(open.title)}
      </button>
      <button type="button" onClick={() => greet.run("en")}>
        {t(greet.title)}
      </button>
    </div>
  )
}
