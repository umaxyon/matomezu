import { describe, expect, test } from "bun:test"
import { checkCoreCatalog } from "../../web/src/core/core-catalog"
import { screenOf } from "../../web/src/core/window"
import { BUILTIN } from "../../web/src/plugins"
import { createBookIn } from "../../web/src/plugins/base"
import { CONTROL_CENTER } from "../../web/src/plugins/control-center"
import { isShown } from "../../web/src/store/commands"
import { createMatomezu } from "../../web/src/store/create"
import { warningsOf } from "../../web/src/store/plugin"
import { SAMPLE_BOOKS } from "../sample-books"
import { BUILTIN_PARTS, newStore } from "../support"

const CENTER = "@matomezu/control-center:control-center"

describe("コントロールセンター", () => {
  test("コントロールセンターはブックでないので、ブックを持たないインスタンスは何も開かない", () => {
    const instance = createMatomezu({ plugins: BUILTIN, controlCenter: CENTER })
    expect(instance.controlCenter).toBe(CENTER)
    expect(Object.keys(instance.state.getState().books)).toEqual([])
    expect(screenOf(instance.state.getState().window).stages[0]!.opened).toBeNull()
  })

  test("最初に開くのは、渡したブックの最初の 1 冊", () => {
    const instance = newStore()
    expect(screenOf(instance.state.getState().window).stages[0]!.opened?.book).toBe(SAMPLE_BOOKS[0]!.id)
    expect(createBookIn(instance, "s1", { title: "新しい図", type: "@matomezu/drawing:drawing" })).toBe(true)
  })

  test("コントロールセンターの無いインスタンスは、ブックの一覧を変えるアクションを断り、そのコマンドを出さない", () => {
    const instance = createMatomezu({ plugins: BUILTIN, books: SAMPLE_BOOKS })
    expect(instance.controlCenter).toBeNull()
    expect(createBookIn(instance, "s1", { title: "新しい図", type: "@matomezu/drawing:drawing" })).toBe(false)
    expect(isShown(instance, instance.state.getState(), "s1", "@matomezu/base:book-new")).toBe(false)
  })

  test("コントロールセンターのプラグインが無くても、base と図面（と図面が選ぶもの）でインスタンスを作れる", () => {
    const plugins = BUILTIN.filter(p => p.id !== "@matomezu/control-center")
    const instance = createMatomezu({ plugins, partial: true, books: SAMPLE_BOOKS })
    expect(instance.catalog.core.controlCenters.size).toBe(0)
    expect(instance.actions.command("s1", "@matomezu/base:stage-split")).toBe(true)
  })

  test("渡すコントロールセンターは表になければ error。許すアクションが表に無ければ組み立てを止める", () => {
    // @ts-expect-error 表に無い id は型でも誤り
    expect(() => createMatomezu({ plugins: BUILTIN, controlCenter: "@matomezu/drawing:drawing" })).toThrow("E110")
    const bad = { ...CONTROL_CENTER, actions: [...CONTROL_CENTER.actions, "nope" as never] }
    const parts = { ...BUILTIN_PARTS, controlCenters: [bad] }
    expect(checkCoreCatalog(parts).map(p => p.code)).toEqual(["E041"])
  })

  test("設定はアクションで変え、コントロールセンターが許さなければ変えず、そのコマンドも出さない。fixedUserSettings の項目だけを変えさせないこともできる", () => {
    const lang = { "@matomezu/base:lang": "matomezu:en" }
    const skin = { "@matomezu/base:skin": "@matomezu/base:dark" }
    const instance = newStore()
    expect(instance.actions.command("s1", "@matomezu/base:settings-set", lang)).toBe(true)
    expect(instance.state.getState().lang).toBe("en")
    const withCenter = (center: object) =>
      createMatomezu({
        plugins: [
          BUILTIN[0],
          { ...BUILTIN[1], controlCenters: [{ ...CONTROL_CENTER, ...center }] },
          ...BUILTIN.slice(2),
        ],
        controlCenter: CENTER,
      })
    // 設定を変えさせないコントロールセンター
    const locked = withCenter({ actions: [] })
    expect(locked.actions.perform("@matomezu/base:settings-set", { values: skin }).ok).toBe(false)
    expect(isShown(locked, locked.state.getState(), "s1", "@matomezu/base:settings-set")).toBe(false)
    expect(createBookIn(locked, "s1", { title: "x", type: "@matomezu/drawing:drawing" })).toBe(false)
    // スキンだけを変えさせないコントロールセンター: 言語は変えられ、スキンは断る（一緒に頼んだ言語も変えない）
    const some = withCenter({ fixedUserSettings: ["@matomezu/base:skin"] })
    expect(some.actions.perform("@matomezu/base:settings-set", { values: { ...lang, ...skin } }).ok).toBe(false)
    expect(some.state.getState().settings).toEqual({})
    expect(some.actions.perform("@matomezu/base:settings-set", { values: lang }).ok).toBe(true)
    // fixedUserSettings に利用者の設定の項目でない id を書いても組み立てられ、その行だけ効かず warning を残す
    const warned = withCenter({ fixedUserSettings: ["@matomezu/base:book-theme"] })
    expect(warningsOf(warned.catalog).map(w => w.code)).toContain("W013")
    // 断りには、使えない項目と理由が付く
    expect(some.actions.perform("@matomezu/base:settings-set", { values: skin })).toEqual({
      ok: false,
      reason: "not-allowed",
      setting: "@matomezu/base:skin",
      because: "fixed",
    })
  })
})
