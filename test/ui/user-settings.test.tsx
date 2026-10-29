// マスターの設定の区分: 利用者の設定の項目を、項目のビューか値の形から作った入力Form で並べる（base の UserSettings）
import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { z } from "zod"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { userSetting } from "../../web/src/core/settings"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { MASTER } from "../../web/src/plugins/books/master/master"
import { MASTER_VIEW_MESSAGES } from "../../web/src/plugins/books/master/view/messages"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { type AnyPluginUi, definePluginUi } from "../../web/src/ui/plugin"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"

afterEach(cleanup)

// 真偽・選択肢・数・文字と、入力Form を作れない形の項目を持つ追加プラグイン
const kit = pluginKit(
  "@ex/s",
  defineMessages({
    on: { en: "On", ja: "入り" },
    mode: { en: "Mode", ja: "モード" },
    fast: { en: "Fast", ja: "速い" },
    size: { en: "Size", ja: "大きさ" },
    nick: { en: "Nick", ja: "呼び名" },
    list: { en: "List", ja: "一覧" },
  }),
)
const EX = definePluginUi(
  kit.plugin({
    userSettings: [
      kit.defineSetting({ id: "on", title: "on", schema: z.boolean(), default: false }),
      kit.defineSetting({
        id: "mode",
        title: "mode",
        schema: z.enum(["fast", "slow"]),
        default: "slow",
        optionTitles: { fast: kit.message("fast") },
      }),
      kit.defineSetting({ id: "size", title: "size", schema: z.number().min(1), default: 3 }),
      kit.defineSetting({ id: "nick", title: "nick", schema: z.string().min(1), default: "a" }),
      kit.defineSetting({ id: "list", title: "list", schema: z.array(z.string()), default: [] }),
    ],
  }),
  {},
)

function renderMaster(plugins: readonly AnyPluginUi[] = [...BUILTIN_UI, EX]) {
  const store = createMatomezu({ home: MASTER.id, books: SAMPLE_BOOKS, lang: "ja", plugins })
  store.actions.openBook("s1", MASTER_BOOK.id)
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  const value = (id: string) => userSetting(store.catalog.core, store.state.getState().settings, `@ex/s:${id}`)
  return { store, value, master: screen.getByRole("region", { name: "マスター" }) }
}

test("設定の区分は画面の作りが決まっていないことを書き添え、base の項目を見出しなしで先に、ほかのプラグインの項目をプラグインの id の見出しの下に並べる", () => {
  const { master } = renderMaster()
  expect(within(master).getByText(MASTER_VIEW_MESSAGES["(The settings screen is provisional)"].ja)).toBeTruthy()
  expect(within(master).getByLabelText("言語")).toBeTruthy()
  expect(within(master).getByLabelText("スキン")).toBeTruthy()
  expect(within(master).getByText("（準備中）")).toBeTruthy()
  expect(
    within(master)
      .getAllByRole("heading", { level: 3 })
      .map(h => h.textContent),
  ).toEqual(["@ex/s"])
  // 入力Form を作れない形の項目は出さない
  expect(within(master).queryByText("一覧")).toBeNull()
})

test("値の形から入力Form を作る: 真偽はスイッチ、選択肢はセレクトForm（名前があれば名前）、数と文字はテキストForm で離れたときに変え、空にすれば既定に戻す", () => {
  const { master, value } = renderMaster()
  fireEvent.click(within(master).getByRole("switch", { name: "入り" }))
  expect(value("on")).toBe(true)
  const mode = within(master).getByLabelText("モード") as HTMLSelectElement
  expect([...mode.options].map(o => o.textContent)).toEqual(["速い", "slow"])
  fireEvent.change(mode, { target: { value: "fast" } })
  expect(value("mode")).toBe("fast")
  const size = within(master).getByLabelText("大きさ") as HTMLInputElement
  fireEvent.change(size, { target: { value: "5" } })
  expect(value("size")).toBe(3)
  fireEvent.blur(size)
  expect(value("size")).toBe(5)
  // 形に合わない値は断られ、今の値に戻る
  fireEvent.change(size, { target: { value: "0" } })
  fireEvent.keyDown(size, { key: "Enter" })
  expect(value("size")).toBe(5)
  expect(size.value).toBe("5")
  const nick = within(master).getByLabelText("呼び名") as HTMLInputElement
  fireEvent.change(nick, { target: { value: "b" } })
  fireEvent.blur(nick)
  expect(value("nick")).toBe("b")
  fireEvent.change(nick, { target: { value: "" } })
  fireEvent.blur(nick)
  expect(value("nick")).toBe("a")
})

test("ホームのタイプが変えさせない項目は、灰色で押せない", () => {
  const fixed = { ...MASTER, fixedSettings: ["@matomezu/base:skin", "@ex/s:on"] }
  const [base, master, ...rest] = BUILTIN_UI
  const { master: view } = renderMaster([base, { ...master, bookTypes: [fixed] } as AnyPluginUi, ...rest, EX])
  expect((within(view).getByLabelText("スキン") as HTMLSelectElement).closest("fieldset")?.disabled).toBe(true)
  expect((within(view).getByRole("switch", { name: "入り" }) as HTMLButtonElement).closest("fieldset")?.disabled).toBe(
    true,
  )
  expect((within(view).getByLabelText("言語") as HTMLSelectElement).closest("fieldset")?.disabled).toBe(false)
})
