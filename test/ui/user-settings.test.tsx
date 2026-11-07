// 設定画面の「全体」: 利用者の設定の項目を、項目のビューか値の形から作った入力Form で並べる（base の UserSettings）。設定画面はフッタメニューの「設定を開く」で開く
import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { z } from "zod"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { userSetting } from "../../web/src/core/settings"
import { defineSettingsCategory } from "../../web/src/plugins/base/ui"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { MASTER } from "../../web/src/plugins/books/master/master"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../web/src/plugins/ui"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { placeAdded } from "../../web/src/ui/layout"
import { type AnyPluginUi, definePluginUi } from "../../web/src/ui/plugin"
import { Screen } from "../../web/src/ui/Screen"
import { MatomezuProvider } from "../../web/src/ui/store-context"
import { SAMPLE_BOOKS } from "../sample-books"

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
const EX_PLUGIN = kit.plugin({
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
})
const EX = definePluginUi(EX_PLUGIN, {})

// book のブックを開いたステージで、設定画面を開いて「全体」の中身（tabpanel）を返す（フッタメニューの「設定を開く」で）
function renderGeneral(plugins: readonly AnyPluginUi[] = [...BUILTIN_UI, EX], book: string = MASTER_BOOK.id) {
  const store = createMatomezu({ home: MASTER.id, books: SAMPLE_BOOKS, lang: "ja", plugins })
  store.actions.openBook("s1", book)
  render(
    <MatomezuProvider instance={store} layout={placeAdded(DEFAULT_LAYOUT, store.plugins)}>
      <Screen />
    </MatomezuProvider>,
  )
  fireEvent.click(screen.getByRole("button", { name: "設定を開く", hidden: true }))
  const value = (id: string) => userSetting(store.catalog.core, store.state.getState().settings, `@ex/s:${id}`)
  return { store, value, general: screen.getByRole("tabpanel", { name: "全体" }) }
}

test("マスターはタイトルだけで、設定の項目も設定を開くボタンも置かない", () => {
  const store = createMatomezu({ home: MASTER.id, books: SAMPLE_BOOKS, lang: "ja", plugins: BUILTIN_UI })
  store.actions.openBook("s1", MASTER_BOOK.id)
  render(
    <MatomezuProvider instance={store} layout={DEFAULT_LAYOUT}>
      <Screen />
    </MatomezuProvider>,
  )
  const master = screen.getByRole("region", { name: "マスター" })
  expect(within(master).queryByRole("button")).toBeNull()
  expect(within(master).queryByLabelText("言語")).toBeNull()
})

test("「全体」は base の項目を見出しなしで先に、どの設定カテゴリも並べていないプラグインの項目をプラグインの id の見出しの下に並べる（マークダウンの項目は「マークダウン」に並べるので出さない）。ショートカットキーの行は出さない（設定画面のショートカットキーで変える）", () => {
  const { general } = renderGeneral()
  expect(within(general).getByLabelText("言語")).toBeTruthy()
  expect(within(general).getByLabelText("スキン")).toBeTruthy()
  expect(within(general).queryByText("ショートカットキー")).toBeNull()
  expect(
    within(general)
      .getAllByRole("heading", { level: 4 })
      .map(h => h.textContent),
  ).toEqual(["@ex/s"])
  expect(within(general).queryByText("Tabキー")).toBeNull()
  // 入力Form を作れない形の項目は出さない
  expect(within(general).queryByText("一覧")).toBeNull()
})

test("マスターでないブックのステージで開いた設定画面でも、「全体」の項目を変えられる（許すかはホームのタイプが決める）", () => {
  const { general, value } = renderGeneral(undefined, SAMPLE_BOOKS[0]!.id)
  fireEvent.click(within(general).getByRole("switch", { name: "入り" }))
  expect(value("on")).toBe(true)
})

test("値の形から入力Form を作る: 真偽はスイッチ、選択肢はセレクトForm（名前があれば名前）、数と文字はテキストForm で離れたときに変え、空にすれば既定に戻す", () => {
  const { general, value } = renderGeneral()
  fireEvent.click(within(general).getByRole("switch", { name: "入り" }))
  expect(value("on")).toBe(true)
  const mode = within(general).getByLabelText("モード") as HTMLSelectElement
  expect([...mode.options].map(o => o.textContent)).toEqual(["速い", "slow"])
  fireEvent.change(mode, { target: { value: "fast" } })
  expect(value("mode")).toBe("fast")
  const size = within(general).getByLabelText("大きさ") as HTMLInputElement
  fireEvent.change(size, { target: { value: "5" } })
  expect(value("size")).toBe(3)
  fireEvent.blur(size)
  expect(value("size")).toBe(5)
  // 形に合わない値は断られ、今の値に戻る
  fireEvent.change(size, { target: { value: "0" } })
  fireEvent.keyDown(size, { key: "Enter" })
  expect(value("size")).toBe(5)
  expect(size.value).toBe("5")
  const nick = within(general).getByLabelText("呼び名") as HTMLInputElement
  fireEvent.change(nick, { target: { value: "b" } })
  fireEvent.blur(nick)
  expect(value("nick")).toBe("b")
  fireEvent.change(nick, { target: { value: "" } })
  fireEvent.blur(nick)
  expect(value("nick")).toBe("a")
})

test("ホームのタイプが変えさせない項目は、灰色で押せない", () => {
  const fixed = { ...MASTER, fixedUserSettings: ["@matomezu/base:skin", "@ex/s:on"] }
  const [base, master, ...rest] = BUILTIN_UI
  const { general: view } = renderGeneral([base, { ...master, bookTypes: [fixed] } as AnyPluginUi, ...rest, EX])
  expect((within(view).getByLabelText("スキン") as HTMLSelectElement).closest("fieldset")?.disabled).toBe(true)
  expect((within(view).getByRole("switch", { name: "入り" }) as HTMLButtonElement).closest("fieldset")?.disabled).toBe(
    true,
  )
  expect((within(view).getByLabelText("言語") as HTMLSelectElement).closest("fieldset")?.disabled).toBe(false)
})

test("設定画面の左の一覧は、配置が置いた設定カテゴリを並べる（全体・マークダウン・ショートカットキー）。「マークダウン」は Tab キーとソースのペインの見た目と段落の中の改行の項目を並べ、行番号は既定で入り、段落の中の改行は既定で改行にする", () => {
  renderGeneral()
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["全体", "マークダウン", "ショートカットキー"])
  fireEvent.click(screen.getByRole("tab", { name: "マークダウン" }))
  const markdown = screen.getByRole("tabpanel", { name: "マークダウン" })
  expect(within(markdown).queryAllByRole("heading", { level: 4 })).toEqual([])
  expect(within(markdown).getByText("Tabキー")).toBeTruthy()
  expect(within(markdown).getByRole("switch", { name: "行番号を出す" }).getAttribute("aria-checked")).toBe("true")
  expect(
    within(markdown).getByRole("switch", { name: "カーソルのある行に下線を引く" }).getAttribute("aria-checked"),
  ).toBe("false")
  expect(within(markdown).getByRole("switch", { name: "空白と Tab を見せる" }).getAttribute("aria-checked")).toBe(
    "false",
  )
  const softBreak = within(markdown).getByLabelText("段落の中の改行") as HTMLSelectElement
  expect(softBreak.value).toBe("line-break")
  expect([...softBreak.options].map(o => o.textContent)).toEqual(["改行にする", "空白にする（GFM方式）"])
})

test("追加プラグインは設定カテゴリを足せる（置いてほしい所の後ろに並び、名指した項目は「全体」から外れる）", () => {
  const category = defineSettingsCategory({
    id: "@ex/s:settings",
    title: kit.message("mode") as never, // 試しのプラグインは文言の表に書き足していない
    settings: ["@ex/s:mode", "@ex/s:on"],
    place: { after: "@matomezu/base:settings-general" },
  })
  const { general } = renderGeneral([...BUILTIN_UI, definePluginUi(EX_PLUGIN, { widgets: [category] })])
  expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual([
    "全体",
    "モード",
    "マークダウン",
    "ショートカットキー",
  ])
  expect(within(general).queryByLabelText("モード")).toBeNull()
  expect(within(general).getByLabelText("大きさ")).toBeTruthy()
  fireEvent.click(screen.getByRole("tab", { name: "モード" }))
  const own = screen.getByRole("tabpanel", { name: "モード" })
  // 名指した順に並べる（セレクトForm のモードが先、スイッチの入りが後）
  const mode = within(own).getByLabelText("モード")
  const on = within(own).getByRole("switch", { name: "入り" })
  expect(mode.compareDocumentPosition(on) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
