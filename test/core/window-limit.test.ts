// 開いたままにするスクリーンの数と、ブックをもう開いているブックスクリーン
import { expect, test } from "bun:test"
import { type BookScreen, bookScreenShowing, type OpenedScreen, overLimit } from "../../web/src/core/window"

const plain = (id: string, def: string): OpenedScreen => ({ id, def, props: {} })
const showing = (id: string, ...books: string[]): BookScreen =>
  ({
    id,
    def: "book",
    props: {},
    stages: {
      stages: books.map((book, i) => ({ id: `${id}-s${i}`, opened: { kind: "page", outermost: book, page: "p" } })),
    },
  }) as unknown as BookScreen

test("開いたままにする数を超えた分を、カレントにしたのが古い順に閉じる物として答える（ほかの定義のスクリーンは数えない）", () => {
  const screens = [plain("c1", "cc"), showing("c2", "A"), showing("c3", "B"), showing("c4", "C")]
  // カレントにした順: c3 → c1 → c2 → c4
  const win = { screens, order: ["c3", "c1", "c2", "c4"] }
  expect(overLimit(win, "book", 2)).toEqual(["c3"])
  expect(overLimit(win, "book", 1)).toEqual(["c3", "c2"])
  expect(overLimit(win, "book", 3)).toEqual([])
  expect(overLimit(win, "cc", 1)).toEqual([])
  expect(overLimit(win, "book", 0)).toEqual(["c3", "c2", "c4"])
})

test("ブックをステージに開いているブックスクリーンを答える（分けたステージの物も。いくつも在れば、いちばん最近カレントにした物）", () => {
  const screens = [plain("c1", "cc"), showing("c2", "A", "B"), showing("c3", "B"), showing("c4")]
  expect(bookScreenShowing({ screens, order: ["c1", "c2", "c3", "c4"] }, "A")?.id).toBe("c2")
  expect(bookScreenShowing({ screens, order: ["c1", "c2", "c3", "c4"] }, "B")?.id).toBe("c3")
  expect(bookScreenShowing({ screens, order: ["c3", "c1", "c4", "c2"] }, "B")?.id).toBe("c2")
  expect(bookScreenShowing({ screens, order: ["c1", "c2", "c3", "c4"] }, "C")).toBeUndefined()
})
