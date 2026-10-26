import { describe, expect, test } from "bun:test"
import { checkCoreCatalog } from "../../web/src/core/core-catalog"
import { BUILTIN } from "../../web/src/plugins"
import { MASTER } from "../../web/src/plugins/books/master/master"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { isShown } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { BUILTIN_PARTS, newStore } from "../support"

describe("ホーム", () => {
  test("ホームのあるインスタンスは、1 冊だけのタイプのブックをいつも持ち、渡すブックが無ければホームを開く", () => {
    const instance = createMatomezu({ plugins: BUILTIN, home: "@matomezu/master:master" })
    expect(Object.keys(instance.state.getState().books)).toEqual(["@matomezu/master:master"])
    expect(instance.state.getState().workspace.stages[0]!.opened).toMatchObject({
      type: "@matomezu/master:master",
      book: "@matomezu/master:master",
    })
  })

  test("ホームを開くコマンドは、そのステージでホームを開き、開いている間は押されている", () => {
    const instance = newStore()
    expect(instance.actions.command("s1", "@matomezu/base:stage-home")).toBe(true)
    expect(instance.state.getState().workspace.stages[0]!.opened?.book).toBe("@matomezu/master:master")
    expect(instance.actions.createBook("s1", { title: "新しい図", type: "@matomezu/drawing:drawing" })).toBe(true)
  })

  test("ホームの無いインスタンスは、ブックの一覧を変えるアクションを断り、ホームを開くコマンドを出さない", () => {
    const instance = createMatomezu({ plugins: BUILTIN, books: SAMPLE_BOOKS })
    expect(instance.home).toBeNull()
    expect(instance.actions.createBook("s1", { title: "新しい図", type: "@matomezu/drawing:drawing" })).toBe(false)
    expect(isShown(instance, instance.state.getState(), "s1", "@matomezu/base:stage-home")).toBe(false)
    const empty = createMatomezu({ plugins: BUILTIN })
    expect(empty.state.getState().workspace.stages[0]!.opened).toBeNull()
  })

  test("マスターのプラグインが無くても、base と図面（と図面が選ぶもの）でインスタンスを作れる", () => {
    const plugins = BUILTIN.filter(p => p.id !== "@matomezu/master")
    const instance = createMatomezu({ plugins, partial: true, books: SAMPLE_BOOKS })
    expect(instance.catalog.core.bookTypes.has("@matomezu/master:master")).toBe(false)
    expect(instance.actions.command("s1", "@matomezu/base:stage-split")).toBe(true)
  })

  test("ホームは 1 冊だけのタイプ。1 冊だけのタイプのブックは、そのタイプの id で形に合うもの", () => {
    // @ts-expect-error 何冊も作れるタイプはホームにできない（型でも誤り）
    expect(() => createMatomezu({ plugins: BUILTIN, home: "@matomezu/drawing:drawing" })).toThrow("E110")
    const bad = { ...MASTER, book: { type: "@matomezu/master:master" as const, id: "other" } }
    const parts = {
      ...BUILTIN_PARTS,
      bookTypes: BUILTIN_PARTS.bookTypes.map(t => (t.id === "@matomezu/master:master" ? bad : t)),
    }
    expect(checkCoreCatalog(parts).map(p => p.code)).toEqual(["E019"])
  })

  test("設定はアクションで変え、ホームのタイプが許さない設定は変えず、そのコマンドも出さない", () => {
    const instance = newStore()
    expect(instance.actions.command("s1", "@matomezu/base:settings-lang", "en")).toBe(true)
    expect(instance.state.getState().settings.lang).toBe("en")
    // 言語だけを許すホーム
    const strict = {
      ...MASTER,
      actions: { allowed: ["@matomezu/base:settings-lang"], defaults: ["@matomezu/base:settings-lang"] },
    }
    const org = { ...BUILTIN[1], bookTypes: [strict] }
    const locked = createMatomezu({ plugins: [BUILTIN[0], org, ...BUILTIN.slice(2)], home: "@matomezu/master:master" })
    expect(locked.actions.setSkin("@matomezu/base:dark")).toBe(false)
    expect(locked.state.getState().settings.skin).toBe("auto")
    expect(isShown(locked, locked.state.getState(), "s1", "@matomezu/base:settings-skin")).toBe(false)
    expect(isShown(locked, locked.state.getState(), "s1", "@matomezu/base:settings-lang")).toBe(true)
    expect(locked.actions.createBook("s1", { title: "x", type: "@matomezu/drawing:drawing" })).toBe(false)
  })
})
