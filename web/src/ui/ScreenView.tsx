// スクリーンのビュー: 開いているスクリーン 1 枚を、置いた所に描く。スクリーンアレンジメントのウィジェットが、見せたい所に置く（大きさ・余白・動きは、置いた側が決める）。
// 描くのは、そのスクリーンの定義の id と同じ名前のスロットに置いたウィジェット。中のビューには、描いている場所のスクリーン（screen-context.tsx）を渡す。
// 利用者が中を押すか、中にフォーカスが入ると、そのスクリーンをカレントスクリーンにする（キーが効く先が移る）。
// スクリーンを id で名指すので、スクリーンアレンジメントのウィジェットの中でだけ描ける（外なら E128）。描いたスクリーンの中は、スクリーンアレンジメントの外
import { useCallback } from "react"
import type { ScreenId } from "../core/catalog"
import { fail } from "../core/errors"
import { currentScreen, type OpenedScreen, shownScreens } from "../core/window"
import { ArrangedProvider, useArranged } from "./arranged-context"
import { Slot } from "./Slot"
import { ScreenProvider } from "./screen-context"
import { useInstance, useMatomezuState, useStoreActions } from "./store-context"

// closed を渡すと、もう閉じたスクリーンを、閉じたときの値で描く（閉じる動きの間だけ描き続けるのに使う。カレントスクリーンにはしない）
export function ScreenView({ screen, closed }: { screen: string; closed?: OpenedScreen }) {
  const catalog = useInstance().catalog.core
  const liveDef = useMatomezuState(s => s.window.screens.find(x => x.id === screen)?.def)
  const liveProps = useMatomezuState(s => s.window.screens.find(x => x.id === screen)?.props)
  const live = liveDef !== undefined
  const opened = liveDef !== undefined ? { id: screen, def: liveDef, props: liveProps } : closed
  const current = useMatomezuState(s => currentScreen(s.window).id === screen)
  const shown = useMatomezuState(s => shownScreens(catalog, s.window).includes(screen))
  const { makeScreenCurrent } = useStoreActions()
  if (!useArranged()) fail("E128", { name: "ScreenView" })
  const take = useCallback(() => {
    if (live) makeScreenCurrent(screen)
  }, [makeScreenCurrent, screen, live])
  if (!opened) return null
  return (
    <div style={{ display: "contents" }} onPointerDownCapture={take} onFocusCapture={take}>
      <ArrangedProvider arranged={false}>
        <ScreenProvider screen={{ id: opened.id, def: opened.def, props: opened.props, shown, current }}>
          <Slot name={opened.def as ScreenId} props={{}} />
        </ScreenProvider>
      </ArrangedProvider>
    </div>
  )
}
