// しおりの割り振り: スロットの並びで先のウィジェットの物を先に、同じウィジェットの中は古い順に、5 つまで並べ、残りの数と、残りを持つウィジェットを返す
import { expect, test } from "bun:test"
import { allotBookmarks, MAX_BOOKMARKS } from "../../../web/src/plugins/base/bookmarks/allot"

const b = (key: string, at: string) => ({ key, at })

test("並びで先のウィジェットを先に、同じウィジェットの中は古い順に 5 つまで並べる", () => {
  const byWidget = new Map([
    ["mail", [b("m2", "2026-11-21T02"), b("m1", "2026-11-21T01"), b("m3", "2026-11-21T03"), b("m4", "2026-11-21T04")]],
    ["request", [b("r2", "2026-11-21T05"), b("r1", "2026-11-21T00"), b("r3", "2026-11-21T06")]],
  ])
  const got = allotBookmarks(["request", "mail"], byWidget)
  expect(MAX_BOOKMARKS).toBe(5)
  expect(got.shown.map(s => s.bookmark.key)).toEqual(["r1", "r2", "r3", "m1", "m2"])
  expect(got.rest).toBe(2)
  expect(got.hidden).toEqual(["mail"])
})

test("片づけば次が出る。並べきれれば残りは 0", () => {
  const got = allotBookmarks(
    ["request", "mail"],
    new Map([
      ["request", [b("r2", "t2")]],
      ["mail", [b("m1", "t1"), b("m2", "t2")]],
    ]),
  )
  expect(got.shown.map(s => s.bookmark.key)).toEqual(["r2", "m1", "m2"])
  expect(got).toMatchObject({ rest: 0, hidden: [] })
})

test("要求だけで 5 を超えれば、郵便は並ばず、残りに数える", () => {
  const requests = ["1", "2", "3", "4", "5", "6"].map(n => b(`r${n}`, `t${n}`))
  const got = allotBookmarks(
    ["request", "mail"],
    new Map([
      ["request", requests],
      ["mail", [b("m1", "t0")]],
    ]),
  )
  expect(got.shown.map(s => s.bookmark.key)).toEqual(["r1", "r2", "r3", "r4", "r5"])
  expect(got).toMatchObject({ rest: 2, hidden: ["request", "mail"] })
})

test("スロットに無いウィジェットの物は並べない。時点が同じなら渡した順", () => {
  const got = allotBookmarks(
    ["mail"],
    new Map([
      ["mail", [b("a", "t"), b("b", "t")]],
      ["other", [b("x", "t")]],
    ]),
  )
  expect(got.shown.map(s => s.bookmark.key)).toEqual(["a", "b"])
})
