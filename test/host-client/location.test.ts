// URL と画面の場所の行き来（host-client/location.ts）: 開いたときに URL の場所を当てはめ、移動はブラウザの履歴に積み、ほかは待ってまとめて書き換え、
// 戻る・進むはその場所を当てはめる
import { expect, test } from "bun:test"
import { z } from "zod"
import { type Address, currentIn, recentStagesIn } from "../../web/src/core/address"
import { NO_OUTERMOST } from "../../web/src/core/folders"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { currentKindOf, screenOf } from "../../web/src/core/window"
import {
  type FormerAddress,
  followLocation,
  fromFormer,
  type Place,
  parseSearch,
  searchOf,
} from "../../web/src/host-client/location"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { SAMPLE_BOOKS } from "../sample-books"
import { newStore, showBooks, showCenter, showFirstBook } from "../support"

// 書いた URL を覚える偽の Place（later はすぐには呼ばず、flush で呼ぶ）
function fakePlace(start = "") {
  let now = start
  let at = 0 // 今のブラウザの履歴の行の番号（この窓が積んだ順）
  const rows = new Map<number, string>() // 行の番号 → その行の URL
  let backs = 0 // place.back が呼ばれた回数
  const pushed: string[] = []
  const replaced: string[] = []
  let pop: () => void = () => {}
  let waiting: (() => void) | null = null
  const place: Place = {
    search: () => now,
    index: () => at,
    push: (s, index) => {
      now = s
      at = index
      rows.set(index, s)
      pushed.push(s)
    },
    back: () => {
      backs++
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
      at = [...rows].find(([, v]) => v === search)?.[0] ?? 0
      pop()
    },
    backCalls: () => backs,
  }
}

// 書いた URL（今の形）の場所
const written = (search: string) => parseSearch(search) as Address
// 書いた URL の、ブックスクリーン（いちばん最近カレントにした、ステージを並べるスクリーン）の中の場所
const stagesIn = (search: string) => recentStagesIn(written(search))?.stages
// 書いた URL の、カレントスクリーンの定義の id
const frontDefIn = (search: string) => {
  const address = written(search)
  return address.screens.find(x => x.id === currentIn(address))?.def
}

test("URL の形: 値 1 つ（sc）に、スクリーンの並び・カレントにした順と、ステージごとのブック・ページ・倍率とずらす量、場所に入れるプラグイン状態を書く。読み戻すと同じ場所", () => {
  const address: Address = {
    screens: [
      { id: "c1", def: "@x/home", props: {}, states: { "@x/pane": "b" } },
      {
        id: "c2",
        def: "@x/books",
        props: {},
        states: {},
        stages: {
          places: [
            { outermost: "b1", page: "p1", binder: null, zoom: 1, pan: { x: 0, y: 0 }, states: {} },
            {
              outermost: NO_OUTERMOST,
              page: null,
              binder: null,
              zoom: 1.25,
              pan: { x: 12.5, y: -3 },
              states: { "@x/p": { a: 1 } },
            },
          ],
          current: 1,
          share: 0.4,
        },
      },
      { id: "c3", def: "@x/ticket", props: { ticket: "@ex/notes:t1" }, states: {} },
    ],
    order: ["c2", "c1", "c3"],
    arrangement: "@x/one",
    arrangementValue: {},
    window: { "@x/tab": "two" },
  }
  const search = searchOf(address)
  expect(JSON.parse(new URLSearchParams(search).get("sc") ?? "")).toEqual({
    s: [
      { i: "c1", d: "@x/home", t: { "@x/pane": "b" } },
      {
        i: "c2",
        d: "@x/books",
        g: {
          l: [
            { b: "b1", p: "p1", v: [1, 0, 0] },
            { b: null, v: [1.25, 12.5, -3], s: { "@x/p": { a: 1 } } },
          ],
          c: 1,
          r: 0.4,
        },
      },
      { i: "c3", d: "@x/ticket", p: { ticket: "@ex/notes:t1" } },
    ],
    o: ["c2", "c1", "c3"],
    a: "@x/one",
    w: { "@x/tab": "two" },
  })
  expect(parseSearch(search)).toEqual(address)
  expect(parseSearch("?x=1")).toBeNull()
  // 読めない値・形の合わない値は、場所ではない。形の合わないスクリーンは落とす
  expect(parseSearch("?sc=%7Bx")).toBeNull()
  expect(parseSearch(`?sc=${encodeURIComponent("[1]")}`)).toBeNull()
  expect(parseSearch(`?sc=${encodeURIComponent('{"s":[1,{"i":"c1","d":"@x/home"}],"o":[1,"c1"]}')}`)).toEqual({
    screens: [{ id: "c1", def: "@x/home", props: {}, states: {} }],
    order: ["c1"],
    arrangement: "",
    arrangementValue: {},
    window: {},
  })
})

test("前の形の URL（b0・p0・v0・s0…、c・r・w・f）も読み、今開いているスクリーンに重ねて今の形に直す", () => {
  const former = parseSearch(
    `?b0=b1&p0=p1&v0=1,0,0&b1=&v1=1.25,12.5,-3&s1={"@x/p":{"a":1}}&w={"@x/tab":"two"}&c=1&r=0.4`,
  )
  expect(former).toEqual({
    former: true,
    kind: "book-screen",
    stages: [
      { outermost: "b1", page: "p1", binder: null, zoom: 1, pan: { x: 0, y: 0 }, states: {} },
      {
        outermost: NO_OUTERMOST,
        page: null,
        binder: null,
        zoom: 1.25,
        pan: { x: 12.5, y: -3 },
        states: { "@x/p": { a: 1 } },
      },
    ],
    current: 1,
    share: 0.4,
    window: { "@x/tab": "two" },
  })
  // プラグイン状態が JSON のオブジェクトでなければ空（中身の形は store が確かめる）
  expect(parseSearch("?b0=b1&v0=1,0,0&s0=%7Bx&w=%5B1%5D&c=0&r=0.5")).toMatchObject({
    stages: [{ states: {} }],
    window: {},
  })
  expect(parseSearch("?f=center")).toMatchObject({ kind: "control-center", stages: [] })
  expect(parseSearch("?f=book")).toMatchObject({ kind: "book-screen", stages: [] })
  const now: Address = {
    screens: [
      { id: "c1", def: "@x/home", props: {}, states: {} },
      { id: "c2", def: "@x/books", props: {}, states: {}, stages: { places: [], current: 0, share: 0.5 } },
    ],
    order: ["c1", "c2"],
    arrangement: "@x/one",
    arrangementValue: {},
    window: {},
  }
  const placed = fromFormer(former as FormerAddress, now)
  expect(placed.screens[1]?.stages).toMatchObject({
    current: 1,
    share: 0.4,
    places: [{ outermost: "b1" }, { outermost: NO_OUTERMOST }],
  })
  expect(placed.order).toEqual(["c1", "c2"])
  expect(placed.window).toEqual({ "@x/tab": "two" })
  // ステージの無い前の形は、カレントスクリーンの種類だけを替える（ステージは今のまま）
  const center = fromFormer(parseSearch("?f=center") as FormerAddress, now)
  expect(center.order).toEqual(["c2", "c1"])
  expect(center.screens[1]?.stages).toEqual(now.screens[1]?.stages)
})

test("開いたときは URL の場所を当てはめる（読み直しても同じ所が開く）", () => {
  const store = newStore()
  const f = fakePlace("?b0=b3&p0=p1&v0=1,0,0&c=0&r=0.5")
  followLocation(store, f.place)
  expect(screenOf(store.state.getState().window).stages[0]!.opened?.outermost).toBe("b3")
})

// 同じ同期の処理が終わるのを待つ
const settled = () => Promise.resolve()

test("ブック・ページの移動と分割はブラウザの履歴に積み、境目などは待ってまとめて書き換える。戻るとその場所に戻り、ブラウザの履歴には積まない", async () => {
  const store = newStore()
  const f = fakePlace()
  followLocation(store, f.place)
  store.actions.openBook("s1", "b2")
  await settled()
  expect(f.pushed.map(s => stagesIn(s)?.places[0]?.outermost)).toEqual(["b2"])
  store.actions.split("s1")
  await settled()
  expect(f.pushed).toHaveLength(2)
  store.actions.moveDivider(300, 1000)
  await settled()
  expect(f.pushed).toHaveLength(2)
  f.flush()
  expect(stagesIn(f.replaced.at(-1)!)?.share).toBe(0.3)
  // 戻る: 1 つ前の場所（b2 を開いた 1 つのステージ）
  f.back(f.pushed[0]!)
  const ws = screenOf(store.state.getState().window)
  expect(ws.stages.map(s => s.opened?.outermost)).toEqual(["b2"])
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
  expect(stagesIn(f.pushed[0]!)?.places.map(s => s.outermost)).toEqual(["b1", "b3"])
})

test("URL が無い（開いた直後）なら、コントロールセンターをカレントスクリーンにする。URL にブックスクリーンの場所があれば、ブックスクリーンをカレントスクリーンにする", () => {
  const first = newStore()
  followLocation(first, fakePlace().place)
  expect(currentKindOf(first.state.getState().window)).toBe("control-center")
  const second = newStore()
  followLocation(second, fakePlace("?b0=b3&p0=p1&v0=1,0,0&c=0&r=0.5").place)
  expect(currentKindOf(second.state.getState().window)).toBe("book-screen")
})

test("カレントスクリーンは URL のカレントにした順に書く。後ろのブックスクリーンの場所も書く", () => {
  const store = newStore()
  const f = fakePlace()
  followLocation(store, f.place)
  expect(frontDefIn(f.replaced[0]!)).toBe("@matomezu/control-center:screen")
  expect(stagesIn(f.replaced[0]!)?.places[0]?.outermost).toBe("b1")
})

test("カレントスクリーンを替えるのは、ブラウザの履歴に 1 つ積む。戻るとカレントスクリーンが戻り、後ろのブックスクリーンの中は残る", async () => {
  const store = newStore()
  const f = fakePlace("?b0=b1&p0=p1&v0=1,0,0&c=0&r=0.5")
  followLocation(store, f.place)
  const was = screenOf(store.state.getState().window)
  showCenter(store)
  await settled()
  expect(f.pushed).toHaveLength(1)
  expect(frontDefIn(f.pushed[0]!)).toBe("@matomezu/control-center:screen")
  showBooks(store)
  await settled()
  expect(f.pushed).toHaveLength(2)
  // 戻る: コントロールセンター
  f.back(f.pushed[0]!)
  expect(currentKindOf(store.state.getState().window)).toBe("control-center")
  expect(screenOf(store.state.getState().window).stages[0]!.opened).toEqual(was.stages[0]!.opened)
  expect(f.pushed).toHaveLength(2)
})

// 積むと宣言した画面の状態の値が変わると、ブラウザの履歴に積む（宣言が答える）。書き換えると宣言した物は、まとめて書き換える
test("積むと宣言したステージに結ばない値は変わるたびにブラウザの履歴に積み、書き換えると宣言したステージの値は積まず、戻ると前の値に戻る", async () => {
  const kit = pluginKit("k", defineMessages({}))
  const TAB = kit.definePluginState({
    id: "tab",
    scope: "window",
    schema: z.enum(["one", "two"]),
    address: "push",
  })
  const MODE = kit.definePluginState({ id: "mode", scope: "stage", schema: z.string(), address: "replace" })
  const store = createMatomezu({
    plugins: [...BUILTIN, kit.plugin({ pluginStates: [TAB, MODE] })],
    controlCenter: BUILTIN_CONTROL_CENTER,
    books: SAMPLE_BOOKS,
    lang: "ja",
    partial: true,
  })
  showFirstBook(store)
  const f = fakePlace("?b0=b1&p0=p1&v0=1,0,0&c=0&r=0.5")
  followLocation(store, f.place)
  expect(store.pushing().has("k:tab")).toBe(true)
  expect(store.pushing().has("k:mode")).toBe(false)
  store.setPluginState("k:tab", null, "two")
  await settled()
  expect(f.pushed.map(s => written(s).window)).toEqual([{ "k:tab": "two" }])
  store.setPluginState("k:mode", "s1", "wide")
  await settled()
  expect(f.pushed).toHaveLength(1)
  f.flush()
  expect(stagesIn(f.replaced.at(-1)!)?.places[0]?.states).toEqual({ "k:mode": "wide" })
  // 積む値と書き換える値が同じ処理で変われば、積むのは 1 つで、URL には今の値が全部入る
  store.setPluginState("k:tab", null, "one")
  store.setPluginState("k:mode", "s1", "narrow")
  await settled()
  expect(f.pushed).toHaveLength(2)
  expect(written(f.pushed[1]!).window).toEqual({ "k:tab": "one" })
  expect(stagesIn(f.pushed[1]!)?.places[0]?.states).toEqual({ "k:mode": "narrow" })
  // 戻る: 1 つ前の値（積んだ URL の値）が当たる
  f.back(f.pushed[0]!)
  expect(store.address().window).toEqual({ "k:tab": "two" })
})

test("スクリーンを開くのも、開いているスクリーンの渡す値を setScreenProps で替えるのも、履歴に積む。戻ると前の渡す値に戻る", async () => {
  const store = createMatomezu({
    plugins: BUILTIN,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
  })
  showFirstBook(store)
  const f = fakePlace()
  followLocation(store, f.place)
  const id = store.actions.openScreenId("@matomezu/taskboard:ticket-screen", { ticket: "t1" })
  await settled()
  expect(f.pushed).toHaveLength(1)
  expect(store.actions.setScreenProps(id, { ticket: "t2" })).toBe(true)
  await settled()
  expect(f.pushed).toHaveLength(2)
  expect(f.pushed[1]).toContain("t2")
  // 戻ると、前の渡す値（t1）が当たる
  f.back(f.pushed[0]!)
  expect(JSON.stringify(store.address().screens.find(s => s.id === id)?.props)).toContain("t1")
})

test("この窓が積んだ行が無ければ canGoBack は false、積めば true、戻って先頭に着けば false。requestBack は戻れるときだけブラウザの履歴を戻す", async () => {
  const store = createMatomezu({
    plugins: BUILTIN,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
  })
  showFirstBook(store)
  const f = fakePlace()
  followLocation(store, f.place)
  expect(store.state.getState().canGoBack).toBe(false)
  store.actions.requestBack()
  expect(f.backCalls()).toBe(0)
  store.actions.openScreenId("@matomezu/taskboard:ticket-screen", { ticket: "t1" })
  await settled()
  expect(store.state.getState().canGoBack).toBe(true)
  store.actions.requestBack()
  expect(f.backCalls()).toBe(1)
  // 戻って、この窓が積む前の最初の行に着けば、もう戻る先は無い
  f.back("")
  expect(store.state.getState().canGoBack).toBe(false)
})

test("スクリーンアレンジメントと値は URL に入り、替えると履歴に積む。replaceHistory を頼むと、同じ処理の中の替える・閉じるをまとめて、積まずに書き換える", async () => {
  const store = createMatomezu({
    plugins: BUILTIN,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
  })
  showFirstBook(store)
  const f = fakePlace()
  followLocation(store, f.place)
  const center = store.state.getState().window.order.at(-1) ?? ""
  const ticket = store.actions.openScreenId("@matomezu/taskboard:ticket-screen", { ticket: "t1" })
  store.actions.setScreenArrangement("@matomezu/base:split-rows", { screens: [center, ticket], behind: [] })
  await settled()
  expect(f.pushed).toHaveLength(1)
  expect(written(f.pushed[0]!).arrangement).toBe("@matomezu/base:split-rows")
  expect(written(f.pushed[0]!).arrangementValue).toEqual({ screens: [center, ticket], behind: [] })
  const replacedBefore = f.replaced.length
  store.actions.replaceHistory()
  store.actions.setScreenArrangement("@matomezu/base:one-screen")
  store.actions.closeScreen(ticket)
  await settled()
  expect(f.pushed).toHaveLength(1)
  expect(f.replaced.length).toBe(replacedBefore + 1)
  expect(written(f.replaced.at(-1)!).arrangement).toBe("@matomezu/base:one-screen")
  expect(written(f.replaced.at(-1)!).screens.some(s => s.id === ticket)).toBe(false)
  // 戻ると、分けた形（値ごと）に戻る
  f.back(f.pushed[0]!)
  expect(store.state.getState().window.arrangementValue).toEqual({ screens: [center, ticket], behind: [] })
})
