import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { defineBookType } from "../../web/src/core/def/book-type"
import { isMatomezuError, problemText } from "../../web/src/core/errors"
import { BUILTIN } from "../../web/src/plugins"
import { BASE } from "../../web/src/plugins/base"
import { defineCommand } from "../../web/src/store/commands/def"
import { createMatomezu } from "../../web/src/store/create"
import { defineDialog } from "../../web/src/store/dialogs"
import { definePlugin } from "../../web/src/store/plugin"
import type { Actions } from "../../web/src/store/store"

// 外のプラグインの見本。型の表には書き足さない（書き足すと、このプロジェクトの全部の app に要るものになる）ので、app は partial で作る
const NOTE = defineBookType({
  id: "notes/note",
  version: 1,
  title: "図面",
  schema: z.strictObject({ type: z.literal("notes/note"), id: z.string().min(1), title: z.string() }),
  single: false,
  create: init => ({ type: "notes/note" as const, ...init }),
  pages: null,
  items: { allowed: [], defaults: [] },
  actions: { allowed: [], defaults: [] },
  theme: "standard",
  tokens: [],
})
const SHOOT = defineCommand({
  id: "notes/shoot",
  title: "マスター",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "notes/shot" as never),
  when: () => true,
})
const notes = definePlugin({
  id: "notes",
  bookTypes: [NOTE],
  commands: [SHOOT],
  dialogs: [defineDialog({ id: "notes/shot" })],
})

// 型の表に書き足していない id で呼ぶ
const untyped = (a: Actions) =>
  a as unknown as { command(stage: string, id: string): boolean; openDialog(stage: string, id: string): void }

const thrown = (run: () => unknown) => {
  try {
    run()
  } catch (e) {
    return e
  }
}

describe("app を組み立てる", () => {
  test("渡したプラグインの定義だけを使う", () => {
    const app = createMatomezu({ plugins: [...BUILTIN, notes], partial: true, newId: () => "n1" })
    expect(app.registry.bookTypes.has("notes/note")).toBe(true)
    expect(app.actions.createBook("s1", { title: "メモ", type: "notes/note" })).toBe(true)
    expect(app.state.getState().workspace.stages[0]!.opened).toMatchObject({ type: "notes/note", book: "n1" })
    expect(untyped(app.actions).command("s1", "notes/shoot")).toBe(true)
    expect(app.state.getState().dialog).toMatchObject({ id: "notes/shot", stage: "s1" })

    const plain = createMatomezu({ plugins: BUILTIN })
    expect(plain.actions.createBook("s1", { title: "メモ", type: "notes/note" })).toBe(false)
    expect(thrown(() => untyped(plain.actions).command("s1", "notes/shoot"))).toMatchObject({ code: "E107" })
    expect(thrown(() => untyped(plain.actions).openDialog("s1", "notes/shot"))).toMatchObject({ code: "E108" })
  })

  test("外のプラグインの id は、頭にプラグインの id と / を付ける", () => {
    // @ts-expect-error 頭が無い id
    const bad = definePlugin({ id: "notes", dialogs: [defineDialog({ id: "shot" })] })
    expect(thrown(() => createMatomezu({ plugins: [...BUILTIN, bad], partial: true }))).toMatchObject({
      code: "E301",
    })
  })

  test("プラグインの文言は app の表に入り、コマンドの名前が文言の表に無ければ作らない", () => {
    const greet = definePlugin({ id: "greet", messages: { やあ: { en: "Hi" } } })
    const app = createMatomezu({ plugins: [...BUILTIN, greet], partial: true })
    expect(app.registry.messages.get("やあ")).toEqual({ en: "Hi" })
    const nameless = definePlugin({
      id: "nameless",
      commands: [defineCommand({ id: "nameless/run", title: "無い名前" as never, run: () => {}, when: () => true })],
    })
    const e = thrown(() => createMatomezu({ plugins: [...BUILTIN, nameless], partial: true }))
    expect(isMatomezuError(e) && e.details.map(problemText)).toEqual([
      "E018 command nameless/run: title 無い名前 is not in the messages",
    ])
  })

  test("同じ id のコマンドやダイアログを 2 つのプラグインが持てば作らない", () => {
    const again = definePlugin({ id: "notes", dialogs: [defineDialog({ id: "notes/shot" })] })
    const e = thrown(() => createMatomezu({ plugins: [...BUILTIN, notes, again], partial: true }))
    expect(isMatomezuError(e) && e.code).toBe("E016")
    expect(isMatomezuError(e) && e.details.map(d => d.code)).toEqual(["E001"])
  })

  test("型の表と渡したプラグインが合わなければ型の誤り（行わない）", () => {
    const typeOnly = () => {
      // @ts-expect-error 中の部品を渡していない（書き足した id が足りない）
      createMatomezu({ plugins: [] })
      // @ts-expect-error 型の表に書き足していないプラグインを渡した
      createMatomezu({ plugins: [...BUILTIN, notes] })
      // @ts-expect-error 中の部品を 1 つの並びにしたものではない
      createMatomezu({ plugins: [{ ...BASE, commands: [] }, BUILTIN[1]] })
    }
    expect(typeOnly).toBeFunction()
  })
})
