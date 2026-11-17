// アクションバルクと React の描き直し: クリックで行ったアクションのあと、同じクリックの描き直しの useEffect が行うアクションは、同じバルクに入るか
import { expect, test } from "bun:test"
import { useEffect, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { pagesOf } from "../../web/src/core/book"
import type { DoneBulk } from "../../web/src/store/store"
import { sizedStore } from "../support"

const BOX = "@matomezu/box:shape-nest-box"

test("クリックの描き直しで useEffect が行うアクションが、クリックのアクションと同じバルクに入るかを確かめる", async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  const sent: DoneBulk[] = []
  const store = sizedStore({
    observe: bulk => {
      sent.push(bulk)
      return Promise.resolve({ ok: true })
    },
  })
  const count = () => (pagesOf(store.state.getState().books.b1!)[0]?.items ?? []).length
  function View() {
    const n = useSyncExternalStore(store.state.subscribe, count)
    useEffect(() => {
      if (n > 0) store.actions.perform("@matomezu/base:page-update", { title: `n${n}` }, { page: "p1" })
    }, [n])
    return (
      <button
        type="button"
        onClick={() =>
          store.actions.perform("@matomezu/paper:item-place", { item: BOX, at: { x: 40, y: 40 } }, { page: "p1" })
        }
      >
        place
      </button>
    )
  }
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() => root.render(<View />))
  host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  await new Promise(r => setTimeout(r, 20))
  console.log("bulks:", JSON.stringify(sent.map(b => b.map(d => d.action))))
  expect(sent.length).toBeGreaterThan(0)
  root.unmount()
})
