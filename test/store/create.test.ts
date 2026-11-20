import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { pagesOf } from "../../web/src/core/book"
import { checkCoreCatalog } from "../../web/src/core/core-catalog-check"
import { definePageType } from "../../web/src/core/def/page-type"
import { type MatomezuError, problemText } from "../../web/src/core/errors"
import { translate } from "../../web/src/core/i18n/i18n"
import { screenOf } from "../../web/src/core/window"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { BASE, createBookIn } from "../../web/src/plugins/base"
import { BOX } from "../../web/src/plugins/items/box/box"
import type { Actions } from "../../web/src/store/actions"
import { defineCommand } from "../../web/src/store/commands/def"
import { createMatomezu } from "../../web/src/store/create"
import { defineDialog, defineDialogWith, type PageSettingsArgs } from "../../web/src/store/dialogs"
import { definePlugin } from "../../web/src/store/plugin"
import { BUILTIN_PARTS, showFirstBook } from "../support"

// テストのプラグイン。型（core/catalog.ts）は書き足さない（書き足すと、このプロジェクトの全部のインスタンスに要るものになる）ので、インスタンスは partial で作る
const NOTE = definePageType({
  id: "notes:note",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape" },
  items: { allowed: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: "@matomezu/paper:paper", // 画面に出さないので、プレゼンテーションは表にあるものを借りる
  tokens: [],
})
const SHOOT = defineCommand({
  id: "notes:shoot",
  title: "@matomezu/drawing:Drawing",
  run: (_ctx, a) => (a.openDialog as (id: string) => void)("notes:shot"),
  when: () => true,
})
const notes = definePlugin({
  id: "notes",
  pageTypes: [NOTE],
  commands: [SHOOT],
  dialogs: [defineDialog({ id: "notes:shot" })],
})

// ページに自分のフィールド（根）を足し、ページを作るダイアログとページの設定のダイアログを自分のものにするタイプ
const LEAF_DIALOGS = [
  defineDialog({ id: "notes:leaf-new" }),
  defineDialogWith<PageSettingsArgs>()({ id: "notes:leaf-settings" }),
] as const
const LEAF = definePageType({
  id: "notes:leaf",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  grouping: "none",
  paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape" },
  fields: { root: z.strictObject({ caption: z.string() }) },
  // core/catalog.ts に書き足していないダイアログは、型では名指せないので言い張る
  dialogs: { add: "notes:leaf-new" as never, settings: "notes:leaf-settings" as never },
  items: { allowed: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: ["@matomezu/base:diagram"],
  presentation: "@matomezu/paper:paper",
  tokens: [],
})

// core/catalog.ts に書き足していない id で呼ぶ
const untyped = (a: Actions) =>
  a as unknown as {
    command(stage: string, id: string, args?: unknown): boolean
    openDialog(stage: string, id: string): void
  }

const thrown = (run: () => unknown) => {
  try {
    run()
  } catch (e) {
    return e
  }
}

describe("インスタンスを作る", () => {
  test("渡したプラグインの定義だけを使う", () => {
    // id は n1、n2、… と振る（ブックとその最初のページの id は、重ならない）
    let made = 0
    const instance = createMatomezu({
      plugins: [...BUILTIN, notes],
      partial: true,
      controlCenter: BUILTIN_CONTROL_CENTER,
      newId: () => `n${++made}`,
    })
    showFirstBook(instance)
    expect(instance.catalog.core.pageTypes.has("notes:note")).toBe(true)
    expect(createBookIn(instance, "s1", { title: "メモ", page: { type: "notes:note" } as never })).toBe(true)
    expect(screenOf(instance.state.getState().window).stages[0]!.opened).toMatchObject({
      type: "notes:note",
      outermost: "n1",
    })
    expect(untyped(instance.actions).command("s1", "notes:shoot")).toBe(true)
    expect(instance.state.getState().dialog).toMatchObject({ id: "notes:shot", stage: "s1" })

    const plain = createMatomezu({ plugins: BUILTIN })
    showFirstBook(plain)
    expect(createBookIn(plain, "s1", { title: "メモ", page: { type: "notes:note" } as never })).toBe(false)
    expect(thrown(() => untyped(plain.actions).command("s1", "notes:shoot"))).toMatchObject({ code: "E107" })
    expect(thrown(() => untyped(plain.actions).openDialog("s1", "notes:shot"))).toMatchObject({ code: "E108" })
  })

  test("プラグインの id は、頭にプラグインの id と : を付け、名前は英小文字・数字・- だけ", () => {
    // @ts-expect-error 頭が無い id
    const bad = definePlugin({ id: "notes", dialogs: [defineDialog({ id: "shot" })] })
    expect(thrown(() => createMatomezu({ plugins: [...BUILTIN, bad], partial: true }))).toMatchObject({
      code: "E301",
    })
  })

  test("プラグインの文言はインスタンスの表に入り、コマンドの名前が文言の表に無ければ作らない", () => {
    const greet = definePlugin({
      id: "greet",
      messages: { id: "greet:messages", messages: { "greet:hi": { en: "Hi", ja: "やあ" } } },
    })
    const instance = createMatomezu({ plugins: [...BUILTIN, greet], partial: true })
    showFirstBook(instance)
    expect(instance.catalog.core.messages.get("greet:hi")).toEqual({ en: "Hi", ja: "やあ" })
    // 訳の無い言語では英語の文を出す
    expect(translate(instance.catalog.core.messages, "fr", "greet:hi" as never)).toBe("Hi")
    const nameless = definePlugin({
      id: "nameless",
      commands: [defineCommand({ id: "nameless:run", title: "無い名前" as never, run: () => {}, when: () => true })],
    })
    const e = thrown(() => createMatomezu({ plugins: [...BUILTIN, nameless], partial: true }))
    expect(e).toMatchObject({ name: "MatomezuError" })
    expect((e as MatomezuError).details.map(problemText)).toEqual([
      "E018 command nameless:run: title 無い名前 is not in the messages",
    ])
  })

  test("プラグインの文言の鍵は頭にプラグインの id と : を付け、英語の文（en）を持つ。そうでなければ型の誤りで、作らない", () => {
    // @ts-expect-error 頭が無い鍵
    const bare = definePlugin({ id: "greet", messages: { id: "greet:messages", messages: { hi: { en: "Hi" } } } })
    // @ts-expect-error 英語の文が無い
    const noEnglish = definePlugin({
      id: "greet",
      messages: { id: "greet:messages", messages: { "greet:hi": { ja: "やあ" } } },
    })
    expect(thrown(() => createMatomezu({ plugins: [...BUILTIN, bare], partial: true }))).toMatchObject({ code: "E303" })
    expect(thrown(() => createMatomezu({ plugins: [...BUILTIN, noEnglish], partial: true }))).toMatchObject({
      code: "E304",
    })
  })

  test("同じ id のコマンドやダイアログを 2 つのプラグインが持てば作らない", () => {
    const again = definePlugin({ id: "notes", dialogs: [defineDialog({ id: "notes:shot" })] })
    const e = thrown(() => createMatomezu({ plugins: [...BUILTIN, notes, again], partial: true }))
    expect(e).toMatchObject({ name: "MatomezuError", code: "E016", details: [{ code: "E001" }] })
    expect((e as MatomezuError).details).toHaveLength(1)
  })

  test("形が名指すダイアログは、追加なら ShapeAddArgs、編集なら ShapeEditArgs を受けるものでなければ型の誤り", () => {
    const shape = <const G extends { add?: string; edit?: string }>(dialogs: G) =>
      ({ ...BOX, id: "notes:shape", dialogs }) as Omit<typeof BOX, "id" | "dialogs"> & { id: "notes:shape"; dialogs: G }
    definePlugin({ id: "notes", items: [shape({ add: "@matomezu/box:box-add", edit: "@matomezu/box:box-edit" })] })
    definePlugin({ id: "notes", items: [shape({})] })
    // @ts-expect-error 行の追加のダイアログは { page, list } を受ける
    definePlugin({ id: "notes", items: [shape({ add: "@matomezu/list:row-add" })] })
    // @ts-expect-error 追加のダイアログを編集に名指している
    definePlugin({ id: "notes", items: [shape({ edit: "@matomezu/box:box-add" })] })
  })

  test("ページのタイプが名指すページのダイアログは、ページを作るなら NewPageDialogArgs を受け、ページの設定なら PageSettingsArgs を受けるものでなければ型の誤り", () => {
    const paged = <const G>(dialogs: G) => ({ ...LEAF, dialogs })
    const add = "@matomezu/base:page-new"
    const settings = "@matomezu/base:page-settings"
    definePlugin({ id: "notes", pageTypes: [paged({ add, settings })] })
    // @ts-expect-error ページの設定のダイアログを、ページを作るダイアログに名指している
    definePlugin({ id: "notes", pageTypes: [paged({ add: settings })] })
    // @ts-expect-error ページを作るダイアログを、ページの設定のダイアログに名指している
    definePlugin({ id: "notes", pageTypes: [paged({ settings: add })] })
  })

  test("ページのタイプは、ブック自身だけを変えるアクション（許可スコープが book）を足せも外せもしない（型の誤り。型の無い書き方は E066）。エントリや作るページのアクションは書ける", () => {
    const acting = <const C>(actions: C) => ({ ...LEAF, actions })
    definePlugin({
      id: "notes",
      pageTypes: [acting({ without: ["@matomezu/base:page-move", "@matomezu/base:page-add"] })],
    })
    // @ts-expect-error ブックの名前を変えるアクションは、ブック自身だけを変える
    definePlugin({ id: "notes", pageTypes: [acting({ without: ["@matomezu/base:book-update"] })] })
    // ページをまとめて変えるアクションは、ページ 1 枚ごとに問うので書ける
    definePlugin({ id: "notes", pageTypes: [acting({ without: ["@matomezu/base:pages-update"] })] })
    const drawing = BUILTIN_PARTS.pageTypes.find(t => t.id === "@matomezu/drawing:drawing")!
    const wrong = { ...drawing, actions: { without: ["@matomezu/base:book-update"] } }
    expect(
      checkCoreCatalog({
        ...BUILTIN_PARTS,
        pageTypes: BUILTIN_PARTS.pageTypes.map(t => (t === drawing ? wrong : t)),
      } as never).map(p => p.code),
    ).toEqual(["E066"])
  })

  test("ページのタイプがページのダイアログを名指すと、ページを作る・ページの設定のコマンドはそのダイアログを開く。ページは base の page-add・page-update で、タイプがページに足したフィールドごと作り変える", () => {
    const plugin = definePlugin({ id: "notes", pageTypes: [LEAF], dialogs: LEAF_DIALOGS })
    // ブックの id は n1。断られる page-add も id を 1 つずつ使うので、作れたページの id は見て確かめる
    const ids = ["n1", "x1", "x2", "leaf"]
    const instance = createMatomezu({
      plugins: [...BUILTIN, plugin],
      partial: true,
      controlCenter: BUILTIN_CONTROL_CENTER,
      newId: () => ids.shift() ?? "spare",
    })
    showFirstBook(instance)
    const perform = instance.actions.perform as (id: string, args: unknown, on: unknown) => { ok: boolean }
    expect(createBookIn(instance, "s1", { title: "葉" })).toBe(true)
    expect(untyped(instance.actions).command("s1", "@matomezu/base:page-new", { type: "notes:leaf" })).toBe(true)
    expect(instance.state.getState().dialog).toMatchObject({ id: "notes:leaf-new", stage: "s1" })
    // 要るフィールド（根）を渡さなければ、ブックのデータの形に合わず断る。タイプに無いフィールドも断る
    expect(perform("@matomezu/base:page-add", { type: "notes:leaf", title: "p" }, { book: "n1" }).ok).toBe(false)
    expect(
      perform("@matomezu/base:page-add", { type: "notes:leaf", title: "p", fields: { stem: {} } }, { book: "n1" }).ok,
    ).toBe(false)
    expect(
      perform(
        "@matomezu/base:page-add",
        { type: "notes:leaf", title: "p", fields: { root: { caption: "根" } } },
        { book: "n1" },
      ).ok,
    ).toBe(true)
    const page = () => pagesOf(instance.state.getState().books.n1!)[0]
    expect(page()).toMatchObject({ title: "p", root: { caption: "根" } })
    const made = page()?.id ?? ""
    expect(made).not.toBe("n1")
    expect(perform("@matomezu/base:page-update", { fields: { root: { caption: "幹" } } }, { page: made }).ok).toBe(true)
    expect(page()).toMatchObject({ title: "p", root: { caption: "幹" } })
    instance.actions.openPage("s1", made)
    expect(untyped(instance.actions).command("s1", "@matomezu/base:page-settings")).toBe(true)
    expect(instance.state.getState().dialog).toMatchObject({ id: "notes:leaf-settings", args: { page: made } })
  })

  test("ページのタイプが名指すページのダイアログが無ければ E031 で作らない", () => {
    const plugin = definePlugin({ id: "notes", pageTypes: [LEAF] })
    const e = thrown(() => createMatomezu({ plugins: [...BUILTIN, plugin], partial: true }))
    expect(e).toMatchObject({ name: "MatomezuError" })
    expect((e as MatomezuError).details.map(problemText)).toEqual([
      "E031 pageType notes:leaf: unknown dialog notes:leaf-new",
      "E031 pageType notes:leaf: unknown dialog notes:leaf-settings",
    ])
  })

  test("core/catalog.ts と渡したプラグインが合わなければ型の誤り（行わない）", () => {
    const typeOnly = () => {
      // @ts-expect-error ビルトインプラグインを渡していない（書き足した id が足りない）
      createMatomezu({ plugins: [] })
      // @ts-expect-error core/catalog.ts に書き足していないプラグインを渡した
      createMatomezu({ plugins: [...BUILTIN, notes] })
      // @ts-expect-error ビルトインプラグインを 1 つの並びにしたものではない
      createMatomezu({ plugins: [{ ...BASE, commands: [] }, BUILTIN[1], BUILTIN[2]] })
    }
    expect(typeOnly).toBeFunction()
  })
})
