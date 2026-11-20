// アクションバルクと React の描き直し: クリックで行ったアクションのあと、同じクリックの描き直しで useEffect が行うアクションは、
// React が同じ同期の処理の中で走らせるので、同じアクションバルクに入る
import { expect, test } from "bun:test"
import { useEffect, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { pagesOf } from "../../web/src/core/book"
import type { DoneBulk } from "../../web/src/store/state"
import { sizedStore } from "../support"

const BOX = "@matomezu/box:shape-nest-box"

test("クリックの描き直しで useEffect が行うアクションは、クリックのアクションと同じバルクに入る", async () => {
  // act で包むと効果を act が流すので、包まずにブラウザのクリックと同じ道で確かめる
  const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const was = env.IS_REACT_ACT_ENVIRONMENT
  env.IS_REACT_ACT_ENVIRONMENT = false
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
  try {
    flushSync(() => root.render(<View />))
    host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await new Promise(r => setTimeout(r, 20))
    expect(sent.map(b => b.map(d => d.action))).toEqual([["@matomezu/paper:item-place", "@matomezu/base:page-update"]])
  } finally {
    root.unmount()
    host.remove()
    env.IS_REACT_ACT_ENVIRONMENT = was
  }
})
