import { expect, test } from "bun:test"
import type { ItemPage } from "../../web/src/core/placed"
import { rectsOf } from "../../web/src/core/placed"
import { newStore } from "../support"

// 外したプラグインの星（大きさ無し）と、外したプラグインの線（星から箱へ）が残る図面
const book = {
  type: "@matomezu/drawing:drawing",
  id: "u1",
  title: "星の残る図",
  pages: [
    {
      id: "p1",
      title: "P",
      paper: "@matomezu/base:a4",
      orientation: "landscape",
      items: [
        { id: "s", item: "@foo/stars:star", x: 40, y: 40, props: { points: 5 } },
        { id: "b", item: "@matomezu/box:shape-box", x: 400, y: 40, props: { caption: "箱" } },
        { id: "l", item: "@foo/stars:beam", from: "s", to: "b", props: {} },
      ],
    },
  ],
}

const page = (store: ReturnType<typeof newStore>) =>
  (store.state.getState().books.u1 as unknown as { pages: ItemPage[] }).pages[0]!

test("機能台帳に無いアイテムのあるブックも読め、知らない形は 64×64 の四角として並べ、動かし・消せる。知らない物のデータはそのまま残る", () => {
  const store = newStore({ savedBooks: [book] })
  expect(store.state.getState().partial.map(n => n.code)).toEqual(["N007"])
  expect(rectsOf(store.catalog.core, page(store)).get("s")).toEqual({ x: 40, y: 40, w: 64, h: 64 })
  const on = { book: "u1" }
  expect(
    store.actions.perform("@matomezu/paper:item-move", { page: "p1", items: ["s"], by: { x: 20, y: 0 } }, on).ok,
  ).toBe(true)
  expect(page(store).items?.find(i => i.id === "s") as unknown).toEqual({
    id: "s",
    item: "@foo/stars:star",
    x: 60,
    y: 40,
    props: { points: 5 },
  })
  // ほかのアクションでも、知らない線はそのまま残る
  expect(
    store.actions.perform("@matomezu/paper:item-update", { page: "p1", item: "b", props: { caption: "箱2" } }, on).ok,
  ).toBe(true)
  expect(page(store).items?.find(i => i.id === "l") as unknown).toEqual(book.pages[0]!.items[2])
  expect(store.actions.perform("@matomezu/paper:item-remove", { page: "p1", items: ["s"] }, on).ok).toBe(true)
  expect(page(store).items?.map(i => i.id)).not.toContain("s")
})
