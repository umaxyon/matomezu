import { afterEach, expect, test } from "bun:test"
import { cleanup, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { NO_SCREEN, ScreenProvider } from "../../web/src/ui/screen-context"
import { useScreenHere } from "../../web/src/ui/screen-hooks"

afterEach(cleanup)

const screenAt = (shown: boolean, current: boolean) => ({ id: "s1", def: "any:screen", props: {}, shown, current })

test("useScreenHere は、描いている場所のスクリーンの見えているか・カレントスクリーンかを、定義を問わずに返す。中身が同じ間は同じ参照", () => {
  let screen = screenAt(true, false)
  const wrapper = ({ children }: { children: ReactNode }) => <ScreenProvider screen={screen}>{children}</ScreenProvider>
  const { result, rerender } = renderHook(() => useScreenHere(), { wrapper })
  const first = result.current
  expect(first).toEqual({ shown: true, current: false })
  rerender()
  expect(result.current).toBe(first)
  screen = screenAt(true, true)
  rerender()
  expect(result.current).toEqual({ shown: true, current: true })
})

test("useScreenHere は、スクリーンの外では NO_SCREEN", () => {
  const { result } = renderHook(() => useScreenHere())
  expect(result.current).toBe(NO_SCREEN)
})
