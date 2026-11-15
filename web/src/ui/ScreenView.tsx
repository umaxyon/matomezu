// スクリーンのビュー: 開いているスクリーン 1 枚を、置いた所に描く。スクリーンアレンジメントのウィジェットが、見せたい所に置く（大きさ・余白・動きは、置いた側が決める）。
// 描くのは、そのスクリーンの定義の id と同じ名前のスロットに置いたウィジェット。中のビューには、描いている場所のスクリーン（screen-context.tsx）を渡す。
// 利用者が中を押すか、中にフォーカスが入ると、そのスクリーンをカレントスクリーンにする（キーが効く先が移る）
import { useCallback } from "react"
import type { ScreenId } from "../core/catalog"
import { currentScreen, type OpenedScreen, shownScreens } from "../core/window"
import { Slot } from "./Slot"
import { ScreenProvider } from "./screen-context"
import { useInstance, useMatomezuState, useStoreActions } from "./store-context"

// closed を渡すと、もう閉じたスクリーンを、閉じたときの値で描く（閉じる動きの間だけ描き続けるのに使う。カレントスクリーンにはしない）
export function ScreenView({ screen, closed }: { screen: string; closed?: OpenedScreen }) {
  const catalog = useInstance().catalog.core
  const live = useMatomezuState(s => s.window.screens.find(x => x.id === screen))
  const opened = live ?? closed
  const current = useMatomezuState(s => currentScreen(s.window).id === screen)
  const shown = useMatomezuState(s => shownScreens(catalog, s.window).includes(screen))
  const { makeScreenCurrent } = useStoreActions()
  const take = useCallback(() => {
    if (live) makeScreenCurrent(screen)
  }, [makeScreenCurrent, screen, live])
  if (!opened) return null
  return (
    <div style={{ display: "contents" }} onPointerDownCapture={take} onFocusCapture={take}>
      <ScreenProvider screen={{ id: opened.id, def: opened.def, props: opened.props, shown, current }}>
        <Slot name={opened.def as ScreenId} props={{}} />
      </ScreenProvider>
    </div>
  )
}
