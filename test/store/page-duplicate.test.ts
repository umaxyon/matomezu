// base のアクション page-duplicate（ページを複製する）と page-add の index（入れる所）。page-duplicate は、タイプが宣言した（duplicatesPages）スライドのブックだけが使える

import { expect, test } from "bun:test"
import { pagesOf } from "../../web/src/core/book"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { createMatomezu } from "../../web/src/store/create"
import { newStore, sequence } from "../support"

const TEXT = "@matomezu/slide:slide-text"

type Pages = { id: string; title: string; locked?: boolean; slide?: { id: string }[] }[]

function slideSetup(newId: () => string = sequence()) {
  const instance = createMatomezu({
    plugins: BUILTIN,
    controlCenter: "@matomezu/control-center:control-center",
    newId,
  })
  createBookIn(instance, "s1", { title: "スライド" })
  const book = Object.keys(instance.state.getState().books).find(
    id => (instance.state.getState().books[id] as { type: string }).type === "@matomezu/slide-book:slide",
  ) as string
  const perform = (id: string, args: object) =>
    (
      instance.actions as unknown as {
        perform(id: string, a: object, on: { book: string }): { ok: boolean; result?: { page?: string } }
      }
    ).perform(id, args, { book })
  const pages = () => pagesOf(instance.state.getState().books[book] as unknown as { pages: Pages })
  return { perform, pages }
}

test("page-add の index は、その番号の前に入れる。省略は最後、並びの外は断る。名前を省くと「Untitled」", () => {
  const s = slideSetup()
  expect(s.perform("@matomezu/base:page-add", { title: "A" }).ok).toBe(true)
  expect(s.perform("@matomezu/base:page-add", { title: "B" }).ok).toBe(true)
  expect(s.perform("@matomezu/base:page-add", { title: "C", index: 1 }).ok).toBe(true)
  expect(pagesOf(s)().map(p => p.title)).toEqual(["A", "C", "B"])
  expect(s.perform("@matomezu/base:page-add", { title: "D", index: 3 }).ok).toBe(true)
  expect(pagesOf(s)().map(p => p.title)).toEqual(["A", "C", "B", "D"])
  expect(s.perform("@matomezu/base:page-add", { title: "E", index: 6 }).ok).toBe(false)
  expect(s.perform("@matomezu/base:page-add", { index: 0 }).ok).toBe(true)
  expect(pagesOf(s)()[0]?.title).toBe("Untitled")
})

test("page-duplicate は元のすぐ後ろに写しを足し、中の id を振り直す。ロックは写さない", () => {
  const s = slideSetup()
  const first = s.perform("@matomezu/base:page-add", { title: "A" }).result?.page as string
  s.perform("@matomezu/base:page-add", { title: "B" })
  const placed = s.perform("@matomezu/slide:slide-place", {
    page: first,
    item: TEXT,
    at: { x: 1, y: 2 },
    props: { text: "a" },
  })
  expect(placed.ok).toBe(true)
  expect(s.perform("@matomezu/base:page-lock", { page: first }).ok).toBe(true)
  const done = s.perform("@matomezu/base:page-duplicate", { page: first, title: "A 写し" })
  expect(done.ok).toBe(true)
  const pages = pagesOf(s)()
  expect(pages.map(p => p.title)).toEqual(["A", "A 写し", "B"])
  const [a, copy] = [pages[0], pages[1]]
  expect(copy?.id).toBe(done.result?.page as string)
  expect(copy?.id).not.toBe(a?.id)
  expect(copy?.locked).toBeUndefined()
  expect(copy?.slide?.length).toBe(1)
  expect(copy?.slide?.[0]?.id).not.toBe(a?.slide?.[0]?.id)
  expect(s.perform("@matomezu/base:page-duplicate", { page: "nope" }).ok).toBe(false)
})

test("page-duplicate は、複製を宣言していないタイプでは断る", () => {
  const store = newStore()
  expect(store.actions.perform("@matomezu/base:page-duplicate", { page: "x" }, { book: "b1" }).ok).toBe(false)
})

test("ページの id は newId の値そのまま（uuid）。page-add でも page-duplicate でも、短くしない", () => {
  let n = 0
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`
  const s = slideSetup(uuid)
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
  const added = s.perform("@matomezu/base:page-add", { title: "A" }).result?.page as string
  expect(added).toMatch(UUID)
  const copied = s.perform("@matomezu/base:page-duplicate", { page: added }).result?.page as string
  expect(copied).toMatch(UUID)
  expect(copied).not.toBe(added)
  expect(pagesOf(s)().map(p => p.id)).toEqual([added, copied])
})
