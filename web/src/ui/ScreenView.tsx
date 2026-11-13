// スクリーンのビュー: 開いているスクリーン 1 枚を、置いた所に描く。スクリーンアレンジメントのウィジェットが、見せたい所に置く（大きさ・余白・動きは、置いた側が決める）。
// 描くのは、そのスクリーンの定義の id と同じ名前のスロットに置いたウィジェット。中のビューには、描いている場所のスクリーン（screen-context.tsx）を渡す。
// 利用者が中を押すか、中にフォーカスが入ると、そのスクリーンをカレントスクリーンにする（キーが効く先が移る）
import { useCallback } from "react"
import type { SlotId } from "../core/catalog"
import { currentScreen, shownScreens } from "../core/window"
import { Slot } from "./Slot"
import { ScreenProvider } from "./screen-context"
import { useActions, useInstance, useMatomezuState } from "./store-context"

export function ScreenView({ screen }: { screen: string }) {
  const catalog = useInstance().catalog.core
  const opened = useMatomezuState(s => s.window.screens.find(x => x.id === screen))
  const current = useMatomezuState(s => currentScreen(s.window).id === screen)
  const shown = useMatomezuState(s => shownScreens(catalog, s.window).includes(screen))
  const { makeScreenCurrent } = useActions()
  const take = useCallback(() => makeScreenCurrent(screen), [makeScreenCurrent, screen])
  if (!opened) return null
  return (
    <div style={{ display: "contents" }} onPointerDownCapture={take} onFocusCapture={take}>
      <ScreenProvider screen={{ id: opened.id, def: opened.def, props: opened.props, shown, current }}>
        <Slot name={opened.def as SlotId} props={{} as never} />
      </ScreenProvider>
    </div>
  )
}
