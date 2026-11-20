import { afterEach, expect, test } from "bun:test"
import { cleanup, render, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { ArrangedProvider } from "../../web/src/ui/arranged-context"
import { ScreenView } from "../../web/src/ui/ScreenView"
import { useArrangedScreens } from "../../web/src/ui/screen-hooks"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

const instance = () => createMatomezu({ controlCenter: BUILTIN_CONTROL_CENTER, lang: "ja", plugins: BUILTIN_UI })

test("並べるスクリーンを id で名指す useArrangedScreens と ScreenView は、スクリーンアレンジメントのウィジェットの外では E128", () => {
  expect(() => renderHook(() => useArrangedScreens())).toThrow("E128")
  const store = instance()
  const screen = store.state.getState().window.screens[0]!.id
  expect(() =>
    render(
      <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
        <ScreenView screen={screen} />
      </MatomezuProvider>,
    ),
  ).toThrow("E128")
})

test("スクリーンアレンジメントの中で描いたスクリーンの中は、スクリーンアレンジメントの外（中のウィジェットは並べるスクリーンを名指せない）", () => {
  const store = instance()
  const wrapper = (arranged: boolean) =>
    function Wrap({ children }: { children: ReactNode }) {
      return (
        <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
          <ArrangedProvider arranged={arranged}>{children}</ArrangedProvider>
        </MatomezuProvider>
      )
    }
  const { result } = renderHook(() => useArrangedScreens(), { wrapper: wrapper(true) })
  expect(result.current.screens.map(s => s.id)).toEqual(store.state.getState().window.screens.map(s => s.id))
  expect(() => renderHook(() => useArrangedScreens(), { wrapper: wrapper(false) })).toThrow("E128")
})
