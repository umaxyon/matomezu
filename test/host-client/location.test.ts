// URL と画面の場所の行き来（host-client/location.ts）: 開いたときに URL の場所を当てはめ、移動はブラウザの履歴に積み、ほかは待ってまとめて書き換え、
// 戻る・進むはその場所を当てはめる
import { expect, test } from "bun:test"
import { z } from "zod"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { screenOf } from "../../web/src/core/window"
import { followLocation, type Place, parseSearch, searchOf } from "../../web/src/host-client/location"
import { BUILTIN } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { SAMPLE_BOOKS } from "../sample-books"
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

test("URL の形: ステージごとにブック・ページ・倍率とずらす量・場所に入れる画面の状態、続けてカレントと境目。読み戻すと同じ場所", () => {
  const address = {
    front: "book-screen" as const,
    frame: { "@x/tab": "two" },
    stages: [
      { book: "b1", page: "p1", zoom: 1, pan: { x: 0, y: 0 }, states: {} },
      { book: null, page: null, zoom: 1.25, pan: { x: 12.5, y: -3 }, states: { "@x/p": { a: 1 } } },
    ],
    current: 1,
    share: 0.4,
  }
  const search = searchOf(address)
  expect(decodeURIComponent(search)).toBe(
    `?b0=b1&p0=p1&v0=1,0,0&b1=&v1=1.25,12.5,-3&s1={"@x/p":{"a":1}}&w={"@x/tab":"two"}&c=1&r=0.4`,
  )
  expect(parseSearch(search)).toEqual(address)
  // id に : や / が入っていても読み戻せる（プラグインの名前空間の付いたブックの id など）
  const namespaced = { ...address, stages: [{ ...address.stages[0]!, book: "@ex/notes:memo", page: null }] }
  expect(parseSearch(searchOf(namespaced))).toEqual(namespaced)
  expect(parseSearch("?x=1")).toBeNull()
  // 画面の状態が JSON のオブジェクトでなければ空（中身の形は store が確かめる）
  expect(parseSearch("?b0=b1&v0=1,0,0&s0=%7Bx&c=0&r=0.5")?.stages[0]?.states).toEqual({})
  expect(parseSearch("?b0=b1&v0=1,0,0&s0=%5B1%5D&c=0&r=0.5")?.stages[0]?.states).toEqual({})
  // 窓の外の画面の状態 w も同じ（JSON のオブジェクトでなければ空。無ければ書かない）
  expect(parseSearch("?b0=b1&v0=1,0,0&w=%5B1%5D&c=0&r=0.5")?.frame).toEqual({})
  expect(searchOf({ ...address, frame: {} })).not.toContain("w=")
})

test("開いたときは URL の場所を当てはめる（読み直しても同じ所が開く）", () => {
  const store = newStore()
  const f = fakePlace("?b0=b3&p0=p1&v0=1,0,0&c=0&r=0.5")
  followLocation(store, f.place)
  expect(screenOf(store.state.getState().window).stages[0]!.opened?.book).toBe("b3")
})

// 同じ同期の処理が終わるのを待つ
const settled = () => Promise.resolve()

test("ブック・ページの移動と分割はブラウザの履歴に積み、境目などは待ってまとめて書き換える。戻るとその場所に戻り、ブラウザの履歴には積まない", async () => {
  const store = newStore()
  const f = fakePlace()
  followLocation(store, f.place)
  store.actions.openBook("s1", "b2")
  await settled()
  expect(f.pushed.map(s => parseSearch(s)?.stages[0]?.book)).toEqual(["b2"])
  store.actions.split("s1")
  await settled()
  expect(f.pushed).toHaveLength(2)
  store.actions.moveDivider(300, 1000)
  await settled()
  expect(f.pushed).toHaveLength(2)
  f.flush()
  expect(parseSearch(f.replaced.at(-1)!)?.share).toBe(0.3)
  // 戻る: 1 つ前の場所（b2 を開いた 1 つのステージ）
  f.back(f.pushed[0]!)
  const ws = screenOf(store.state.getState().window)
  expect(ws.stages.map(s => s.opened?.book)).toEqual(["b2"])
  expect(f.pushed).toHaveLength(2)
})

test("同じ処理の中の移動（分割してブックとページを開く）は、ブラウザの履歴に 1 つだけ積む", async () => {
  const store = newStore()
  const f = fakePlace()
  followLocation(store, f.place)
  store.actions.split("s1")
  const right = screenOf(store.state.getState().window).stages[1]!.id
  store.actions.openBook(right, "b3")
  store.actions.openPage(right, "p1")
  await settled()
  expect(f.pushed).toHaveLength(1)
  expect(parseSearch(f.pushed[0]!)?.stages.map(s => s.book)).toEqual(["b1", "b3"])
})

test("URL が無い（開いた直後）なら、コントロールセンターを前に出す。URL にブックスクリーンの場所があれば、ブックスクリーンを前に出す", () => {
  const first = newStore()
  followLocation(first, fakePlace().place)
  expect(first.state.getState().window.front).toBe("control-center")
  const second = newStore()
  followLocation(second, fakePlace("?b0=b3&p0=p1&v0=1,0,0&c=0&r=0.5").place)
  expect(second.state.getState().window.front).toBe("book-screen")
})

test("前に出す物は URL の f に書く（コントロールセンターの間だけ。ステージの無い URL も読む）。後ろのブックスクリーンの場所も書く", () => {
  const store = newStore()
  const f = fakePlace()
  followLocation(store, f.place)
  expect(f.replaced[0]).toContain("f=center")
  expect(f.replaced[0]).toContain("b0=b1")
  expect(parseSearch("?f=center")).toMatchObject({ front: "control-center", stages: [] })
  expect(parseSearch("?f=book")).toMatchObject({ front: "book-screen", stages: [] })
  expect(parseSearch("?b0=b1&c=0&r=0.5")?.front).toBe("book-screen")
})

test("前に出す物を替えるのは、ブラウザの履歴に 1 つ積む。戻ると前に出す物が戻り、後ろのブックスクリーンの中は残る", async () => {
  const store = newStore()
  const f = fakePlace("?b0=b1&p0=p1&v0=1,0,0&c=0&r=0.5")
  followLocation(store, f.place)
  const was = screenOf(store.state.getState().window)
  store.actions.showControlCenter()
  await settled()
  expect(f.pushed).toHaveLength(1)
  expect(parseSearch(f.pushed[0]!)?.front).toBe("control-center")
  store.actions.showBookScreen()
  await settled()
  expect(f.pushed).toHaveLength(2)
  // 戻る: コントロールセンター
  f.back(f.pushed[0]!)
  expect(store.state.getState().window.front).toBe("control-center")
  expect(screenOf(store.state.getState().window).stages[0]!.opened).toEqual(was.stages[0]!.opened)
  expect(f.pushed).toHaveLength(2)
})

// 積むと宣言した画面の状態の値が変わると、ブラウザの履歴に積む（宣言が答える）。書き換えると宣言した物は、まとめて書き換える
test("積むと宣言した窓の外の値は変わるたびにブラウザの履歴に積み、書き換えると宣言したステージの値は積まず、戻ると前の値に戻る", async () => {
  const kit = pluginKit("k", defineMessages({}))
  const TAB = kit.definePlacedState({
    id: "tab",
    scope: "frame",
    schema: z.enum(["one", "two"]),
    browserHistory: "push",
  })
  const MODE = kit.definePlacedState({ id: "mode", scope: "stage", schema: z.string(), browserHistory: "replace" })
  const store = createMatomezu({
    plugins: [...BUILTIN, kit.plugin({ placedStates: [TAB, MODE] })],
    controlCenter: "@matomezu/control-center:control-center",
    books: SAMPLE_BOOKS,
    lang: "ja",
    partial: true,
  })
  const f = fakePlace("?b0=b1&p0=p1&v0=1,0,0&c=0&r=0.5")
  followLocation(store, f.place)
  expect(store.pushing().has("k:tab")).toBe(true)
  expect(store.pushing().has("k:mode")).toBe(false)
  store.setPlaced("k:tab", null, "two")
  await settled()
  expect(f.pushed.map(s => parseSearch(s)?.frame)).toEqual([{ "k:tab": "two" }])
  store.setPlaced("k:mode", "s1", "wide")
  await settled()
  expect(f.pushed).toHaveLength(1)
  f.flush()
  expect(parseSearch(f.replaced.at(-1)!)?.stages[0]?.states).toEqual({ "k:mode": "wide" })
  // 積む値と書き換える値が同じ処理で変われば、積むのは 1 つで、URL には今の値が全部入る
  store.setPlaced("k:tab", null, "one")
  store.setPlaced("k:mode", "s1", "narrow")
  await settled()
  expect(f.pushed).toHaveLength(2)
  const last = parseSearch(f.pushed[1]!)
  expect(last?.frame).toEqual({ "k:tab": "one" })
  expect(last?.stages[0]?.states).toEqual({ "k:mode": "narrow" })
  // 戻る: 1 つ前の値（積んだ URL の値）が当たる
  f.back(f.pushed[0]!)
  expect(store.address().frame).toEqual({ "k:tab": "two" })
})
