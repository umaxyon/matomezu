// ex12 のビュー: 縦に並べるスクリーンアレンジメント、ラベルを見せるスクリーン、切り替えのボタン
import {
  ScreenView,
  useActionsHere,
  useMessages,
  usePluginState,
  useScreen,
  useScreens,
  useSetPluginState,
} from "matomezu/ui"
import { EX12_DEFAULT_HEIGHT, EX12_HEIGHT, EX12_PANEL, EX12_STACK } from "."
import { kit } from "./kit"

const ONE_SCREEN = "@matomezu/base:one-screen"
const BOOK_SCREEN = "@matomezu/base:book-screen"

// 開いているスクリーンを、開いた順に上から並べる。高さはスクリーンごとの値で、入りきらなければこの中でスクロールする
export function Ex12Stack() {
  const { screens } = useScreens()
  return (
    <div data-ex12-stack style={{ position: "absolute", inset: 0, overflow: "auto" }}>
      {screens.map(s => (
        <Ex12Row key={s.id} screen={s.id} current={s.current} closable={s.def === EX12_PANEL.id} />
      ))}
    </div>
  )
}

// 並べたスクリーン 1 枚: 高さを当てた枠の中に、そのスクリーンを描く
function Ex12Row({ screen, current, closable }: { screen: string; current: boolean; closable: boolean }) {
  const t = useMessages(kit)
  const height = usePluginState(kit, EX12_HEIGHT, screen) ?? EX12_DEFAULT_HEIGHT
  const setHeight = useSetPluginState(kit, EX12_HEIGHT)
  const { close } = useScreens()
  return (
    <section data-ex12-row={screen} data-current={current} style={{ borderBottom: "1px solid gray" }}>
      <div>
        <button type="button" onClick={() => setHeight(screen, height + 100)}>
          {t("taller")}
        </button>
        {closable && (
          <button type="button" onClick={() => close(screen)}>
            {t("close")}
          </button>
        )}
      </div>
      {/* どのスクリーンも、決まった高さの枠の中に描く（はみ出す中身は、枠の中でスクロールする。ステージを並べるスクリーンは、中身の高さまかせにできない） */}
      <div
        data-ex12-screen
        style={{ position: "relative", height, display: "flex", flexDirection: "column", overflow: "auto" }}
      >
        <ScreenView screen={screen} />
      </div>
    </section>
  )
}

// ラベルを見せるスクリーン（自分に渡された値と、カレントスクリーンかを読む）
export function Ex12Panel() {
  const me = useScreen(EX12_PANEL)
  return (
    <button type="button" data-ex12-panel={me.id} data-current={me.current} data-shown={me.shown}>
      {me.props.label}
    </button>
  )
}

// ステージの上の行に置く切り替え: 縦に並べる・1 枚ずつ・パネルを足す・ブックスクリーンを足す
export function Ex12Switch() {
  const t = useMessages(kit)
  const { setScreenArrangement, openScreen } = useActionsHere()
  const { screens, open } = useScreens()
  return (
    <div data-ex12-switch>
      <button type="button" onClick={() => setScreenArrangement(EX12_STACK.id)}>
        {t("showStacked")}
      </button>
      <button type="button" onClick={() => setScreenArrangement(ONE_SCREEN)}>
        {t("showOne")}
      </button>
      <button type="button" onClick={() => open(EX12_PANEL, { label: `${t("panel")} ${screens.length}` })}>
        {t("addPanel")}
      </button>
      <button type="button" onClick={() => openScreen(BOOK_SCREEN, {})}>
        {t("addBooks")}
      </button>
    </div>
  )
}
