// スクリーンアレンジメント「上下に分ける」: 見えているスクリーンと、分けた並びの変わり（開く・閉じる・広げる）
import { expect, test } from "bun:test"
import { applySplitFrom, showBookSplit } from "../../../web/src/plugins/base/window/apply-split"
import {
  bookSplitWay,
  planAt,
  planClose,
  planExpand,
  planOpen,
  splitOf,
  splitShown,
} from "../../../web/src/plugins/base/window/split"
import { newStore, showCenter } from "../../support"

const opened = (...ids: string[]) => ids.map(id => ({ id }))

test("分けた並びは、開いている物だけで、2 枚に満たなければ分けていない", () => {
  expect(splitOf(opened("c1", "c2", "c3"), { screens: ["c1", "c3"] })).toEqual(["c1", "c3"])
  expect(splitOf(opened("c1", "c3"), { screens: ["c1", "c2"] })).toEqual([])
  expect(splitOf(opened("c1", "c2"), { screens: ["c1", "c1", "c2"] })).toEqual(["c1", "c2"])
  expect(splitOf(opened("c1", "c2"), { other: 1 })).toEqual([])
})

test("見えているのは、カレントスクリーンが並びにあれば並び全部、無ければカレントスクリーンだけ", () => {
  const screens = opened("c1", "c2", "c3", "c4")
  const value = { screens: ["c1", "c3"] }
  // コントロールセンター（c1）とチケット（c3）
  expect(splitShown(screens, ["c2", "c1", "c3"], value)).toEqual(["c1", "c3"])
  // 上の段を押してカレントにしても、2 枚のまま
  expect(splitShown(screens, ["c2", "c3", "c1"], value)).toEqual(["c1", "c3"])
  // 巣箱でブックスクリーン（c2）へ行けば、それだけ
  expect(splitShown(screens, ["c1", "c3", "c2"], value)).toEqual(["c2"])
  // 並びが閉じられて 1 枚になれば、カレントスクリーンだけ
  expect(splitShown(opened("c1", "c2"), ["c2", "c1"], value)).toEqual(["c1"])
})

test("低くてカレントスクリーンだけを見せている並び（fits が current）は、並びにあってもカレントスクリーンだけ", () => {
  const screens = opened("c1", "c2")
  expect(splitShown(screens, ["c1", "c2"], { screens: ["c1", "c2"], fits: "current" })).toEqual(["c2"])
  expect(splitShown(screens, ["c1", "c2"], { screens: ["c1", "c2"], fits: "split" })).toEqual(["c1", "c2"])
})

test("開く: 分けていなければ起点と 2 枚で分け、分けていれば起点の後ろ・前・代わりに入れる。max を超えたら起点から遠い物を外す", () => {
  // コントロールセンター（c1）から、下に開く
  expect(planOpen([], "c1", "c3", "after", 2)).toEqual({ screens: ["c1", "c3"] })
  // 分けている間にコントロールセンターから開くと、コントロールセンターの代わりに上へ入る（コントロールセンターは外れ、開いたまま）
  expect(planOpen(["c1", "c3"], "c1", "c4", "in-place", 2)).toEqual({ screens: ["c4", "c3"] })
  // 下のチケット（c3）から「分割で開く」: 上に入れ、上のコントロールセンターは外れる
  expect(planOpen(["c1", "c3"], "c3", "c4", "before", 2)).toEqual({ screens: ["c4", "c3"] })
  // 上のチケット（c4）から「分割で開く」: 下に入れ、下のチケットは外れる
  expect(planOpen(["c4", "c3"], "c4", "c5", "after", 2)).toEqual({ screens: ["c4", "c5"] })
  // 上限が大きければ外さない
  expect(planOpen(["c1", "c3"], "c3", "c4", "after", 3)).toEqual({ screens: ["c1", "c3", "c4"] })
})

test("閉じる: 閉じる物を閉じ、残りが 1 枚なら分けるのをやめて、残った物をカレントスクリーンにする。ステージを並べるかで分けない", () => {
  expect(planClose(["c4", "c3"], "c4")).toEqual({ screens: [], closing: ["c4"], current: "c3" })
  expect(planClose(["b1", "lib"], "lib")).toEqual({ screens: [], closing: ["lib"], current: "b1" })
  // 3 枚から 1 枚を閉じれば、残りで分けたまま
  expect(planClose(["c1", "c3", "c4"], "c3")).toEqual({ screens: ["c1", "c4"], closing: ["c3"] })
})

test("広げる: 分けるのをやめて起点をカレントスクリーンにする（ほかは閉じない）", () => {
  expect(planExpand("c3")).toEqual({ screens: [], current: "c3" })
})

// コントロールセンターをカレントにし、チケット 1 枚を下に分けた store
function splitStore() {
  const store = newStore()
  showCenter(store)
  const read = () => store.state.getState()
  const center = read().window.order.at(-1) ?? ""
  const ticket = store.actions.openScreenId("@matomezu/taskboard:ticket-screen", { ticket: "t1" })
  applySplitFrom(store.actions, planOpen([], center, ticket, "after", 2))
  return { store, read, center, ticket }
}

test("並びの変わりを行うと、並びから外れた物は閉じずに開いたまま、閉じると決めた物だけを閉じる。1 枚になったら残った物を窓いっぱいに見せる", () => {
  const { store, read, center, ticket } = splitStore()
  expect(read().window.arrangementValue).toEqual({ screens: [center, ticket] })
  // 2 枚目がコントロールセンターの代わりに上に入る。コントロールセンターは開いたまま
  const second = store.actions.openScreenId("@matomezu/taskboard:ticket-screen", { ticket: "t2" })
  applySplitFrom(store.actions, planOpen([center, ticket], center, second, "in-place", 2))
  expect(read().window.arrangementValue).toEqual({ screens: [second, ticket] })
  expect(read().window.screens.some(s => s.id === center)).toBe(true)
  // 下の 1 枚目と入れ替えると、外れたチケットは窓の上限（コントロールセンターを数えずに 2 枚）で閉じる。並べ方の変わりでは閉じない
  const third = store.actions.openScreenId("@matomezu/taskboard:ticket-screen", { ticket: "t3" })
  applySplitFrom(store.actions, planAt([second, ticket], 1, third))
  expect(read().window.arrangementValue).toEqual({ screens: [second, third] })
  expect(read().window.screens.some(s => s.id === ticket)).toBe(false)
  // 上の 2 枚目を閉じると、閉じて、残った 3 枚目を窓いっぱいに見せる（コントロールセンターは戻さない）
  applySplitFrom(store.actions, planClose([second, third], second))
  expect(read().window.screens.some(s => s.id === second)).toBe(false)
  expect(read().window.arrangement).toBe("@matomezu/base:one-screen")
  expect(read().window.order.at(-1)).toBe(third)
})

test("分けている間の Esc（最後に開いたスクリーンを閉じるコマンド）は、ブラウザの履歴を戻すよう頼む", () => {
  const { store, read, ticket } = splitStore()
  store.setCanGoBack(true)
  const before = read().backRequests
  expect(store.actions.command(ticket, "@matomezu/base:split-back")).toBe(true)
  expect(read().backRequests).toBe(before + 1)
})

test("並びの index 番目を開いた物に替える（そこにあった物は外れ、開いたまま）", () => {
  expect(planAt(["c1", "c3"], 0, "c4")).toEqual({ screens: ["c4", "c3"] })
  expect(planAt(["c1", "c3"], 1, "c4")).toEqual({ screens: ["c1", "c4"] })
  expect(planAt(["c1", "c3"], 5, "c4")).toEqual({ screens: ["c1", "c3"] })
})

test("ブックスクリーンを分割で開く入れ方: 分けていなければ下。分けていれば、起点を替えるか、起点を残してもう片方の段を替える", () => {
  expect(bookSplitWay(false, -1, false)).toBe("after")
  expect(bookSplitWay(true, 0, false)).toBe("in-place")
  expect(bookSplitWay(true, 1, false)).toBe("in-place")
  // 起点を残す（チケットスクリーン）: 上からなら下の段、下からなら上の段に入り、2 段のまま
  expect(bookSplitWay(true, 0, true)).toBe("after")
  expect(bookSplitWay(true, 1, true)).toBe("before")
  expect(planOpen(["t1", "t2"], "t1", "b", bookSplitWay(true, 0, true), 2)).toEqual({ screens: ["t1", "b"] })
  expect(planOpen(["t1", "t2"], "t2", "b", bookSplitWay(true, 1, true), 2)).toEqual({ screens: ["b", "t2"] })
})

test("分割で開く（showBookSplit）: 起点の下に入れ、もう並びに在れば光らせるだけ。窓が低ければ分けずに窓いっぱいに出す", () => {
  const store = newStore()
  const read = () => store.state.getState().window
  showCenter(store)
  const center = read().order[read().order.length - 1] ?? ""
  const flashed: string[] = []
  const open = (book: string, tall: boolean) =>
    showBookSplit({
      actions: store.actions,
      readWindow: read,
      here: center,
      keepHere: false,
      max: 2,
      tall,
      flash: screen => flashed.push(screen),
      book,
      page: undefined,
    })
  // 分けていない所から: 起点の下に入れる
  open("b2", true)
  const added = read().order[read().order.length - 1] ?? ""
  expect(read().arrangementValue).toEqual({ screens: [center, added] })
  // もう並びに在るブック: 並べ直さず、光らせる
  open("b2", true)
  expect(read().arrangementValue).toEqual({ screens: [center, added] })
  expect(flashed).toEqual([added])
  // 低い窓: 分けずに窓いっぱいに出す（並びは変えない）
  const fresh = newStore()
  showCenter(fresh)
  const before = fresh.state.getState().window.arrangement
  showBookSplit({
    actions: fresh.actions,
    readWindow: () => fresh.state.getState().window,
    here: fresh.state.getState().window.order.at(-1) ?? "",
    keepHere: false,
    max: 2,
    tall: false,
    flash: () => {},
    book: "b2",
    page: undefined,
  })
  expect(fresh.state.getState().window.arrangement).toBe(before)
  expect(
    fresh.state.getState().window.screens.find(s => s.id === fresh.state.getState().window.order.at(-1))?.stages,
  ).toBeTruthy()
})
