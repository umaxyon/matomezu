// スクリーンアレンジメント「上下に分ける」: 見えているスクリーンと、分けた並びの変わり（開く・閉じる・広げる）
import { expect, test } from "bun:test"
import {
  behindOf,
  planClose,
  planExpand,
  planOpen,
  splitOf,
  splitShown,
} from "../../../web/src/plugins/base/window/split"

const opened = (...ids: string[]) => ids.map(id => ({ id }))

test("分けた並びは、開いている物だけで、2 枚に満たなければ分けていない", () => {
  expect(splitOf(opened("c1", "c2", "c3"), { screens: ["c1", "c3"], behind: [] })).toEqual(["c1", "c3"])
  expect(splitOf(opened("c1", "c3"), { screens: ["c1", "c2"], behind: [] })).toEqual([])
  expect(splitOf(opened("c1", "c2"), { screens: ["c1", "c1", "c2"], behind: [] })).toEqual(["c1", "c2"])
  expect(splitOf(opened("c1", "c2"), { other: 1 })).toEqual([])
})

test("見えているのは、カレントスクリーンが並びにあれば並び全部、無ければカレントスクリーンだけ", () => {
  const screens = opened("c1", "c2", "c3", "c4")
  const value = { screens: ["c1", "c3"], behind: [] }
  // コントロールセンター（c1）とチケット（c3）
  expect(splitShown(screens, ["c2", "c1", "c3"], value)).toEqual(["c1", "c3"])
  // 上の段を押してカレントにしても、2 枚のまま
  expect(splitShown(screens, ["c2", "c3", "c1"], value)).toEqual(["c1", "c3"])
  // 巣箱でブックスクリーン（c2）へ行けば、それだけ
  expect(splitShown(screens, ["c1", "c3", "c2"], value)).toEqual(["c2"])
  // 並びが閉じられて 1 枚になれば、カレントスクリーンだけ
  expect(splitShown(opened("c1", "c2"), ["c2", "c1"], value)).toEqual(["c1"])
})

test("開く: 分けていなければ起点と 2 枚で分け、分けていれば起点の後ろ・前・代わりに入れる。max を超えたら起点から遠い物を外す", () => {
  // コントロールセンター（c1）から、下に開く
  expect(planOpen([], "c1", "c3", "after", 2)).toEqual({ screens: ["c1", "c3"], leaving: [] })
  // 分けている間にコントロールセンターから開くと、コントロールセンターの代わりに上へ入る（コントロールセンターは外れる）
  expect(planOpen(["c1", "c3"], "c1", "c4", "in-place", 2)).toEqual({ screens: ["c4", "c3"], leaving: ["c1"] })
  // 下のチケット（c3）から「分割して開く」: 上に入れ、上のコントロールセンターは外れる
  expect(planOpen(["c1", "c3"], "c3", "c4", "before", 2)).toEqual({ screens: ["c4", "c3"], leaving: ["c1"] })
  // 上のチケット（c4）から「分割して開く」: 下に入れ、下のチケットは外れる
  expect(planOpen(["c4", "c3"], "c4", "c5", "after", 2)).toEqual({ screens: ["c4", "c5"], leaving: ["c3"] })
  // 上限が大きければ外さない
  expect(planOpen(["c1", "c3"], "c3", "c4", "after", 3)).toEqual({ screens: ["c1", "c3", "c4"], leaving: [] })
})

test("閉じる: 残りが 1 枚なら、並びから外したが開いたままの物（behind）のいちばん新しい物を上に戻す。無ければ分けない", () => {
  // チケット 2 枚（c4 が上・c3 が下）から上を閉じる: 外していたコントロールセンター（c1）が上に戻る
  expect(planClose(["c4", "c3"], ["c1"], "c4")).toEqual({ screens: ["c1", "c3"], leaving: ["c4"] })
  // 外していた物が無ければ、分けない（並びに関係ない開いたままのスクリーンは戻さない）
  expect(planClose(["c1", "c3"], [], "c3")).toEqual({ screens: [], leaving: ["c3"] })
  // 3 枚から 1 枚を閉じれば、残りで分けたまま
  expect(planClose(["c1", "c3", "c4"], [], "c3")).toEqual({ screens: ["c1", "c4"], leaving: ["c3"] })
})

test("値の形に合わなければ並びも外した物も無い。外した物は開いている物だけ", () => {
  expect(behindOf(opened("c1", "c2"), { screens: ["c2"], behind: ["c1", "c9"] })).toEqual(["c1"])
  expect(behindOf(opened("c1"), { screens: [] })).toEqual([])
})

test("広げる: 起点だけを残し、並びのほかの物は閉じる", () => {
  expect(planExpand(["c4", "c3"], "c3")).toEqual({ screens: [], leaving: ["c4"] })
})
