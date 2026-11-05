// URL と画面の場所の行き来（host-client/location.ts）: 開いたときに URL の場所を当てはめ、移動はブラウザの履歴に積み、ほかは待ってまとめて書き換え、
// 戻る・進むはその場所を当てはめる
import { expect, test } from "bun:test"
import { followLocation, type Place, parseSearch, searchOf } from "../../web/src/host-client/location"
import { newStore } from "../support"

// 書いた URL を覚える偽の Place（later はすぐには呼ばず、flush で呼ぶ）
function fakePlace(start = "") {
  let now = start
  const pushed: string[] = []
  const replaced: string[] = []
  let pop: () => void = () => {}
  let waiting: (() => void) | null = null
  const place: Place = {
    search: () => now,
    push: s => {
      now = s
      pushed.push(s)
    },
    replace: s => {
      now = s
      replaced.push(s)
    },
    onPop: listener => {
      pop = listener
      return () => {}
    },
    later: run => {
      waiting = run
      return () => {
        waiting = null
      }
    },
  }
  return {
    place,
    pushed,
    replaced,
    flush: () => {
      waiting?.()
      waiting = null
    },
    back: (search: string) => {
      now = search
      pop()
    },
  }
}

test("URL の形: ステージごとにブック・ページ・倍率とずらす量、続けてカレントと境目。読み戻すと同じ場所", () => {
  const address = {
    stages: [
      { book: "b1", page: "p1", zoom: 1, pan: { x: 0, y: 0 } },
      { book: null, page: null, zoom: 1.25, pan: { x: 12.5, y: -3 } },
    ],
    current: 1,
    share: 0.4,
  }
  const search = searchOf(address)
  expect(decodeURIComponent(search)).toBe("?b0=b1&p0=p1&v0=1,0,0&b1=&v1=1.25,12.5,-3&c=1&r=0.4")
  expect(parseSearch(search)).toEqual(address)
  // id に : や / が入っていても読み戻せる（1 冊だけのタイプのブックの id など）
  const master = { ...address, stages: [{ ...address.stages[0]!, book: "@matomezu/master:master", page: null }] }
  expect(parseSearch(searchOf(master))).toEqual(master)
  expect(parseSearch("?x=1")).toBeNull()
})

test("開いたときは URL の場所を当てはめる（読み直しても同じ所が開く）", () => {
  const store = newStore()
  const f = fakePlace("?b0=b3&p0=p1&v0=1,0,0&c=0&r=0.5")
  followLocation(store, f.place)
  expect(store.state.getState().workspace.stages[0]!.opened?.book).toBe("b3")
})

test("ブック・ページの移動と分割はブラウザの履歴に積み、境目などは待ってまとめて書き換える。戻るとその場所に戻り、ブラウザの履歴には積まない", () => {
  const store = newStore()
  const f = fakePlace()
  followLocation(store, f.place)
  store.actions.openBook("s1", "b2")
  expect(f.pushed.map(s => parseSearch(s)?.stages[0]?.book)).toEqual(["b2"])
  store.actions.split("s1")
  expect(f.pushed).toHaveLength(2)
  store.actions.moveDivider(300, 1000)
  expect(f.pushed).toHaveLength(2)
  f.flush()
  expect(parseSearch(f.replaced.at(-1)!)?.share).toBe(0.3)
  // 戻る: 1 つ前の場所（b2 を開いた 1 つのステージ）
  f.back(f.pushed[0]!)
  const ws = store.state.getState().workspace
  expect(ws.stages.map(s => s.opened?.book)).toEqual(["b2"])
  expect(f.pushed).toHaveLength(2)
})
