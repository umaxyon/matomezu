// ページの題名の案（base/pages/pages.ts の freePageTitle・nextPageTitle）: 数え始めの番号から、重ならない最初の番号
import { expect, test } from "bun:test"
import { freePageTitle, nextPageTitle } from "../../../web/src/plugins/base/pages/pages"

const t = (_key: string, params?: Record<string, unknown>) => `ページ ${params?.n}`

test("freePageTitle: 1 から数え、埋まっている番号を飛ばす。ページの題名の形でない名前は番号をずらさない", () => {
  expect(freePageTitle(t, [])).toBe("ページ 1")
  expect(freePageTitle(t, ["ページ 1", "ページ 2", "ページ 4"])).toBe("ページ 3")
  expect(freePageTitle(t, ["仕事", "本", "図"])).toBe("ページ 1")
  expect(freePageTitle(t, ["ページ 3"], 3)).toBe("ページ 4")
})

test("nextPageTitle: 並んでいる名前の数の次から数える", () => {
  const lineup = { id: "b", lineup: [] }
  expect(nextPageTitle(lineup, t, ["あ", "い"])).toBe("ページ 3")
  expect(nextPageTitle(lineup, t, ["あ", "ページ 3"])).toBe("ページ 4")
  expect(nextPageTitle(lineup, t)).toBe("ページ 1")
})
