// スライドのレイヤー: ページの slide を持つタイプのブックで描かれる。何も無い所の押しは、置こうとしている間（slide のアイテムを）だけ受け、そうでなければ下のレイヤーとステージへ通す

import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, render, screen } from "@testing-library/react"
import { z } from "zod"
import { defineBookType } from "../../web/src/core/def/book-type"
import { definePresentation } from "../../web/src/core/def/presentation"
import { screenOf } from "../../web/src/core/window"
import { createBookIn } from "../../web/src/plugins/base"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import { definePluginUi } from "../../web/src/ui/plugin"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

const TEXT = "@matomezu/slide:slide-text"
const BOX = "@matomezu/box:shape-nest-box"
const LOOK = definePresentation({ id: "back:look" })
const BACK = defineBookType({
  id: "back:back",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  schema: z.strictObject({ type: z.literal("back:back"), id: z.string().min(1) }),
  create: init => ({ type: "back:back" as const, ...init, pages: [] }),
  pages: {
    paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
  },
  items: { allowed: [BOX] },
  slide: { allowed: [TEXT] },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: LOOK.id,
  tokens: [],
})
const back = definePlugin({ id: "back", bookTypes: [BACK], presentations: [LOOK] })
const backUi = definePluginUi(back, { presentationViews: { "back:look": { view: () => <p>back view</p> } } })

const layer = () => document.querySelector<HTMLElement>('[data-key-scope="@matomezu/slide:slide"]')

describe("スライドのレイヤー", () => {
  test("slide を持つタイプのブックで描かれ、置こうとしている間（slide のアイテム）だけ押しを受ける", () => {
    const instance = createMatomezu({
      plugins: [...BUILTIN_UI, backUi],
      partial: true,
      controlCenter: "@matomezu/control-center:control-center",
      lang: "ja",
    })
    render(
      <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
        <Screen />
      </MatomezuProvider>,
    )
    act(() => {
      createBookIn(instance, "s1", { title: "背景", type: "back:back" as never })
    })
    expect(screen.getByText("back view")).toBeTruthy()
    expect(layer()).toBeNull() // ページが無い間は描かない
    const stage = screenOf(instance.state.getState().window).current as string
    act(() => {
      ;(
        instance.actions as unknown as {
          perform(id: string, a: object, on: { book: string }): { ok: boolean }
        }
      ).perform(
        "@matomezu/base:page-add",
        { title: "1" },
        { book: Object.keys(instance.state.getState().books)[0] as string },
      )
    })
    expect(layer()?.dataset.active).toBe("false") // 押しはステージと下のレイヤーへ通す
    act(() => instance.actions.togglePlacing(stage, BOX))
    expect(layer()?.dataset.active).toBe("false") // 紙のアイテムを置こうとしている間は取らない
    act(() => instance.actions.togglePlacing(stage, TEXT))
    expect(layer()?.dataset.active).toBe("true") // slide のアイテムを置こうとしている間は受ける
  })
})
