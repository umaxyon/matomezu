// 印刷を待たせる口: 印刷区画の包み（PrintHolds）の中で usePrintHold(false) を描いている間だけ、待っている物の表に入り、done になるか消えると外れる。包みの外では何もしない
import { afterEach, expect, test } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import { PrintHolds, usePrintHold } from "../../../web/src/plugins/base/print-preview/print-hold"

afterEach(cleanup)

function Waits({ done }: { done: boolean }) {
  usePrintHold(done)
  return null
}

test("包みの中で読み込みを待つ物は、done になるか描かれなくなるまで、待っている物の表に入る", () => {
  const waiting = new Set<string>()
  let changes = 0
  const onChange = () => changes++
  const drawn = (children: React.ReactNode) => (
    <PrintHolds waiting={waiting} onChange={onChange}>
      {children}
    </PrintHolds>
  )
  const { rerender } = render(drawn([<Waits key="a" done={false} />, <Waits key="b" done={false} />]))
  expect(waiting.size).toBe(2)
  rerender(drawn([<Waits key="a" done={true} />, <Waits key="b" done={false} />]))
  expect(waiting.size).toBe(1)
  rerender(drawn([<Waits key="a" done={true} />]))
  expect(waiting.size).toBe(0)
  expect(changes).toBeGreaterThan(0)
})

test("包みの外では、待たせない（ステージや刷るための写しで描いても、表は無い）", () => {
  expect(() => render(<Waits done={false} />)).not.toThrow()
})
