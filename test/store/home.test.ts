import { describe, expect, test } from "bun:test"
import { checkRegistry } from "../../web/src/core/registry"
import { BUILTIN } from "../../web/src/plugins"
import { BASE } from "../../web/src/plugins/base"
import { DRAWING_PLUGIN } from "../../web/src/plugins/drawing"
import { MASTER } from "../../web/src/plugins/master/master"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { isShown } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { BUILTIN_PARTS, newStore } from "../support"

describe("ホーム", () => {
  test("ホームの app は、1 冊だけのタイプのブックをいつも持ち、渡すブックが無ければホームを開く", () => {
    const app = createMatomezu({ plugins: BUILTIN, home: "master" })
    expect(Object.keys(app.state.getState().books)).toEqual(["master"])
    expect(app.state.getState().workspace.stages[0]!.opened).toMatchObject({ type: "master", book: "master" })
  })

  test("ホームを開くコマンドは、そのステージでホームを開き、開いている間は押されている", () => {
    const app = newStore()
    expect(app.actions.command("s1", "stage.home")).toBe(true)
    expect(app.state.getState().workspace.stages[0]!.opened?.book).toBe("master")
    expect(app.actions.createBook("s1", { title: "新しい図", type: "drawing" })).toBe(true)
  })

  test("ホームの無い app は、ブックの一覧を変えるアクションを断り、ホームを開くコマンドを出さない", () => {
    const app = createMatomezu({ plugins: BUILTIN, books: SAMPLE_BOOKS })
    expect(app.home).toBeNull()
    expect(app.actions.createBook("s1", { title: "新しい図", type: "drawing" })).toBe(false)
    expect(isShown(app, app.state.getState(), "s1", "stage.home")).toBe(false)
    const empty = createMatomezu({ plugins: BUILTIN })
    expect(empty.state.getState().workspace.stages[0]!.opened).toBeNull()
  })

  test("マスターのプラグインが無くても、土台と図面だけで app を作れる", () => {
    const app = createMatomezu({ plugins: [BASE, DRAWING_PLUGIN], partial: true, books: SAMPLE_BOOKS })
    expect(app.registry.bookTypes.has("master")).toBe(false)
    expect(app.actions.command("s1", "stage.split")).toBe(true)
  })

  test("ホームは 1 冊だけのタイプ。1 冊だけのタイプのブックは、そのタイプの id で形に合うもの", () => {
    // @ts-expect-error 何冊も作れるタイプはホームにできない（型でも誤り）
    expect(() => createMatomezu({ plugins: BUILTIN, home: "drawing" })).toThrow("E110")
    const bad = { ...MASTER, book: { type: "master" as const, id: "other" } }
    const parts = { ...BUILTIN_PARTS, bookTypes: BUILTIN_PARTS.bookTypes.map(t => (t.id === "master" ? bad : t)) }
    expect(checkRegistry(parts).map(p => p.code)).toEqual(["E019"])
  })
})
