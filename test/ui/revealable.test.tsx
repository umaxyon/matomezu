// Revealable: 物の要素を囲む、名乗り出た要素の実装に、内側から外側の順で頼む。名乗り出ていない要素と、外の端より外は頼まない。
// リストは、頼まれた行を行の並びのスクロールの見える所へ動かす
import { afterEach, expect, test } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import { revealAround, useRevealable } from "../../web/src/plugins/base/utils/revealable"
import { rowScroll } from "../../web/src/plugins/items/list/reveal"

function Box({ name, calls, children }: { name: string; calls: string[]; children?: React.ReactNode }) {
  const ref = useRevealable({ reveal: id => calls.push(`${name}:${id}`) })
  return <div ref={ref}>{children}</div>
}

afterEach(cleanup)

test("物を囲む Revealable に、内側から外側の順で頼む。外の端と、その外は頼まない", () => {
  const calls: string[] = []
  const { container } = render(
    <Box name="outside" calls={calls}>
      <Box name="stage" calls={calls}>
        <Box name="outer" calls={calls}>
          <div>
            <Box name="inner" calls={calls}>
              <span id="thing" />
            </Box>
          </div>
        </Box>
      </Box>
    </Box>,
  )
  const thing = container.querySelector("#thing")!
  const stage = container.firstElementChild!.firstElementChild!
  revealAround(thing, stage, "a1")
  expect(calls).toEqual(["inner:a1", "outer:a1"])
})

test("リストの行は、見えていれば動かさず、上にはみ出すか入りきらなければ行の上に、下にはみ出せば行の下にそろえる", () => {
  expect(rowScroll(10, 20, 100)).toBe(0)
  expect(rowScroll(-30, 20, 100)).toBe(-30)
  expect(rowScroll(90, 20, 100)).toBe(10)
  expect(rowScroll(50, 300, 100)).toBe(50)
})
