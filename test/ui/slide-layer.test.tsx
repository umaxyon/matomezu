// スライドのレイヤー: ページの slide を持つタイプのブックで描かれる。背景のタイプでは、背景編集モードの間だけ操作を受ける（ふだんは描くだけ）。
// 何も無い所の押しは、置こうとしている間（slide のアイテムを）だけ受け、そうでなければ下のレイヤーとステージへ通す

import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, render, screen } from "@testing-library/react"
import { z } from "zod"
import { definePageType } from "../../web/src/core/def/page-type"
import { definePresentation } from "../../web/src/core/def/presentation"
import { screenOf } from "../../web/src/core/window"
import { createBookIn } from "../../web/src/plugins/base"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { definePlugin } from "../../web/src/store/plugin"
import { definePluginUi } from "../../web/src/ui/plugin"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { WindowRoot } from "../../web/src/ui/WindowRoot"

afterEach(cleanup)

const TEXT = "@matomezu/slide:slide-text"
const BOX = "@matomezu/box:shape-nest-box"
const LOOK = definePresentation({ id: "back:look" })
const BACK = definePageType({
  id: "back:back",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  schema: z.strictObject({ type: z.literal("back:back"), id: z.string().min(1) }),
  create: init => ({ type: "back:back" as const, ...init, pages: [] }),
  pages: {
    paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
  },
  items: { allowed: [BOX] },
  slide: { allowed: [TEXT], background: true },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: LOOK.id,
  tokens: [],
})
const back = definePlugin({ id: "back", pageTypes: [BACK], presentations: [LOOK] })
const backUi = definePluginUi(back, { presentationViews: { "back:look": { view: () => <p>back view</p> } } })

const layer = () => document.querySelector<HTMLElement>("[data-slide-layer]")

describe("スライドのレイヤー", () => {
  test("背景を持つタイプのブックでは描かれ、背景編集モードで置こうとしている間（slide のアイテム）だけ押しを受ける", () => {
    const instance = createMatomezu({
      plugins: [...BUILTIN_UI, backUi],
      partial: true,
      controlCenter: "@matomezu/control-center:control-center",
      lang: "ja",
    })
    render(
      <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
        <WindowRoot />
      </MatomezuProvider>,
    )
    act(() => {
      createBookIn(instance, "s1", { title: "背景" })
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
    act(() => instance.actions.togglePlacing(stage, BOX)) // 取り消す
    act(() => instance.actions.togglePlacing(stage, TEXT))
    expect(layer()?.dataset.active).toBe("false") // ふだんの編集では、slide のアイテムを置こうとしても受けない
    act(() => instance.actions.startBackground(stage))
    act(() => instance.actions.togglePlacing(stage, TEXT))
    expect(layer()?.dataset.active).toBe("true") // 背景編集モードで slide のアイテムを置こうとしている間は受ける
    act(() => instance.actions.endBackground(stage))
    expect(layer()?.dataset.active).toBe("false")
  })
})
