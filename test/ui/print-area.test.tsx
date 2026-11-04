// 印刷区画の区切りの線のレイヤー（base の stage/layers.tsx の PrintAreaLayer）: 見せ方が知らせた広さが紙 1 枚より大きいときだけ、紙 1 枚ごとの境目に線を引く
import { afterEach, expect, test } from "bun:test"
import { act, cleanup, render } from "@testing-library/react"
import { paperOf } from "../../web/src/core/stage"
import { PrintAreaLayer } from "../../web/src/plugins/base/stage/layers"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { SAMPLE_BOOKS } from "../sample-books"

afterEach(cleanup)

test("紙 1 枚で描くページには線を引かず、広さが右に 2 枚・下に 3 枚なら、縦の線 1 本と横の線 2 本を引く", () => {
  const instance = createMatomezu({
    plugins: BUILTIN_UI,
    home: "@matomezu/master:master",
    books: SAMPLE_BOOKS,
    lang: "ja",
  })
  instance.actions.resizeStage("s1", { w: 1400, h: 1000 })
  const { container } = render(
    <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
      <PrintAreaLayer stage="s1" />
    </MatomezuProvider>,
  )
  expect(container.querySelector("[data-print-areas]")).toBeNull()
  const stage = instance.state.getState().workspace.stages.find(s => s.id === "s1")!
  const paper = paperOf(stage)!
  act(() => instance.actions.setStageArea("s1", { w: paper.w * 2, h: paper.h * 3 }))
  const areas = container.querySelector("[data-print-areas]")
  expect(areas?.getAttribute("data-print-areas")).toBe("2x3")
  expect(areas?.querySelectorAll("line").length).toBe(3)
  act(() => instance.actions.setStageArea("s1", null))
  expect(container.querySelector("[data-print-areas]")).toBeNull()
})
