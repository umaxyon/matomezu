import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { defineBookType } from "../../web/src/core/def/book-type"
import { isMatomezuError, problemText } from "../../web/src/core/errors"
import { translate } from "../../web/src/core/i18n/i18n"
import { BUILTIN } from "../../web/src/plugins"
import { BASE } from "../../web/src/plugins/base"
import { BOX } from "../../web/src/plugins/items/box/box"
import { defineCommand } from "../../web/src/store/commands/def"
import { createMatomezu } from "../../web/src/store/create"
import { defineDialog } from "../../web/src/store/dialogs"
import { definePlugin } from "../../web/src/store/plugin"
import type { Actions } from "../../web/src/store/store"

// 追加プラグインの見本。機能台帳の型の側には書き足さない（書き足すと、このプロジェクトの全部のインスタンスに要るものになる）ので、インスタンスは partial で作る
const NOTE = defineBookType({
  id: "notes:note",
  version: 1,
  title: "@matomezu/drawing:Drawing",
  schema: z.strictObject({ type: z.literal("notes:note"), id: z.string().min(1) }),
  single: false,
  create: init => ({ type: "notes:note" as const, ...init }),
  pages: null,
  items: { allowed: [], defaults: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/master:master", // 画面に出さないので、見せ方は表にあるものを借りる
  tokens: [],
})
const SHOOT = defineCommand({
  id: "notes:shoot",
  title: "@matomezu/master:Master",
  run: (ctx, a) => (a.openDialog as (stage: string, id: string) => void)(ctx.stage.id, "notes:shot"),
  when: () => true,
})
const notes = definePlugin({
  id: "notes",
  bookTypes: [NOTE],
  commands: [SHOOT],
  dialogs: [defineDialog({ id: "notes:shot" })],
})

// 機能台帳の型の側に書き足していない id で呼ぶ
const untyped = (a: Actions) =>
  a as unknown as { command(stage: string, id: string): boolean; openDialog(stage: string, id: string): void }

const thrown = (run: () => unknown) => {
  try {
    run()
  } catch (e) {
    return e
  }
}

describe("インスタンスを組み立てる", () => {
  test("渡したプラグインの定義だけを使う", () => {
    const instance = createMatomezu({
      plugins: [...BUILTIN, notes],
      partial: true,
      home: "@matomezu/master:master",
      newId: () => "n1",
    })
    expect(instance.catalog.core.bookTypes.has("notes:note")).toBe(true)
    expect(instance.actions.createBook("s1", { title: "メモ", type: "notes:note" as never })).toBe(true)
    expect(instance.state.getState().workspace.stages[0]!.opened).toMatchObject({ type: "notes:note", book: "n1" })
    expect(untyped(instance.actions).command("s1", "notes:shoot")).toBe(true)
    expect(instance.state.getState().dialog).toMatchObject({ id: "notes:shot", stage: "s1" })

    const plain = createMatomezu({ plugins: BUILTIN })
    expect(plain.actions.createBook("s1", { title: "メモ", type: "notes:note" as never })).toBe(false)
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
    const greet = definePlugin({ id: "greet", messages: { "greet:hi": { en: "Hi", ja: "やあ" } } })
    const instance = createMatomezu({ plugins: [...BUILTIN, greet], partial: true })
    expect(instance.catalog.core.messages.get("greet:hi")).toEqual({ en: "Hi", ja: "やあ" })
    // 訳の無い言語では英語の文を出す
    expect(translate(instance.catalog.core.messages, "fr", "greet:hi" as never)).toBe("Hi")
    const nameless = definePlugin({
      id: "nameless",
      commands: [defineCommand({ id: "nameless:run", title: "無い名前" as never, run: () => {}, when: () => true })],
    })
    const e = thrown(() => createMatomezu({ plugins: [...BUILTIN, nameless], partial: true }))
    expect(isMatomezuError(e) && e.details.map(problemText)).toEqual([
      "E018 command nameless:run: title 無い名前 is not in the messages",
    ])
  })

  test("プラグインの文言の鍵は頭にプラグインの id と : を付け、英語の文（en）を持つ。そうでなければ型の誤りで、作らない", () => {
    // @ts-expect-error 頭が無い鍵
    const bare = definePlugin({ id: "greet", messages: { hi: { en: "Hi" } } })
    // @ts-expect-error 英語の文が無い
    const noEnglish = definePlugin({ id: "greet", messages: { "greet:hi": { ja: "やあ" } } })
    expect(thrown(() => createMatomezu({ plugins: [...BUILTIN, bare], partial: true }))).toMatchObject({ code: "E303" })
    expect(thrown(() => createMatomezu({ plugins: [...BUILTIN, noEnglish], partial: true }))).toMatchObject({
      code: "E304",
    })
  })

  test("同じ id のコマンドやダイアログを 2 つのプラグインが持てば作らない", () => {
    const again = definePlugin({ id: "notes", dialogs: [defineDialog({ id: "notes:shot" })] })
    const e = thrown(() => createMatomezu({ plugins: [...BUILTIN, notes, again], partial: true }))
    expect(isMatomezuError(e) && e.code).toBe("E016")
    expect(isMatomezuError(e) && e.details.map(d => d.code)).toEqual(["E001"])
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

  test("機能台帳の型の側と渡したプラグインが合わなければ型の誤り（行わない）", () => {
    const typeOnly = () => {
      // @ts-expect-error ビルトインプラグインを渡していない（書き足した id が足りない）
      createMatomezu({ plugins: [] })
      // @ts-expect-error 機能台帳の型の側に書き足していないプラグインを渡した
      createMatomezu({ plugins: [...BUILTIN, notes] })
      // @ts-expect-error ビルトインプラグインを 1 つの並びにしたものではない
      createMatomezu({ plugins: [{ ...BASE, commands: [] }, BUILTIN[1], BUILTIN[2]] })
    }
    expect(typeOnly).toBeFunction()
  })
})
