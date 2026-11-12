// スクリーンを開け閉めするフックと、開いているスクリーンを読むフック（持ち方は state.ts。窓のプラグイン状態）。窓に 1 つ。
// 開くのは、スクリーンの定義（defineScreen で作ったウィジェット）とそのビューに渡す物。前に出している物（ブックスクリーン・コントロールセンター）は替えない
import { type ReactNode, useCallback } from "react"
import { usePluginState, useSetPluginState, useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { OPEN_SCREEN_STATE, type OpenedScreen } from "./state"

// 開いているスクリーン（開いていなければ "none"）。定義の無いスクリーンと、渡された物が定義の props に合わないスクリーンは、開いていないものとして "none"
export function useOpenedScreen(): OpenedScreen | "none" {
  const opened = usePluginState(kit, OPEN_SCREEN_STATE)
  const widgets = useUiCatalog().widgets
  const def = opened ? widgets.get(opened.screen)?.screen : undefined
  return opened && def?.props.safeParse(opened.props).success ? opened : "none"
}

// スクリーンを開く関数 open と、閉じる関数 close。open の渡す物は、スクリーンのビューが受け取る物
export function useOpenScreen(): {
  open: <P extends object>(screen: { id: string; view: (props: P) => ReactNode }, props: P) => void
  close: () => void
} {
  const set = useSetPluginState(kit, OPEN_SCREEN_STATE)
  const open = useCallback(
    <P extends object>(screen: { id: string; view: (props: P) => ReactNode }, props: P) =>
      set({ screen: screen.id, props }),
    [set],
  )
  const close = useCallback(() => set(undefined), [set])
  return { open, close }
}
