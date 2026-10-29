// 利用者の設定の項目: プラグインの userSettings が持ち、settings-set で変える。役は土台が読む項目の印で、ビルトインプラグインだけが持てる
import { expect, test } from "bun:test"
import { z } from "zod"
import { buildCoreCatalog, checkCoreCatalog } from "../../web/src/core/core-catalog"
import type { SettingDef } from "../../web/src/core/def/setting"
import { performIn } from "../../web/src/core/perform"
import { aiSettings, langOf, userSetting } from "../../web/src/core/settings"
import { BUILTIN } from "../../web/src/plugins"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { assemble, type Plugin } from "../../web/src/store/plugin"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

// 利用者だけが変える項目を 1 つ持つ追加プラグイン
const SECRET: SettingDef = {
  id: "@ex/u:secret",
  title: "@matomezu/base:Language",
  schema: z.string(),
  default: "none",
  userOnly: true,
}
const OPEN: SettingDef = { id: "@ex/u:open", title: "@matomezu/base:Language", schema: z.number(), default: 1 }
const EX: Plugin = { id: "@ex/u", userSettings: [SECRET, OPEN] }

const ctx = (catalog = CORE_CATALOG, by?: "ai") => ({
  catalog,
  home: MASTER_BOOK.id,
  lang: "en",
  newId: () => "x",
  now: "2026-10-29T00:00:00.000Z",
  ...(by ? { by } : {}),
})

test("利用者だけが変える項目は、AI には変えさせず、AI が読む設定と AI に見せる引数の形にも出さない", () => {
  const catalog = assemble([...BUILTIN, EX], MASTER_BOOK.id).catalog.core
  const world = { books: {}, settings: { "@ex/u:secret": "s" } }
  const set = (values: Record<string, unknown>, by?: "ai") =>
    performIn(world, "@matomezu/base:settings-set", { values }, undefined, ctx(catalog, by)).ok
  expect(set({ "@ex/u:secret": "t" })).toBe(true)
  expect(set({ "@ex/u:secret": "t" }, "ai")).toBe(false)
  expect(set({ "@ex/u:open": 2 }, "ai")).toBe(true)
  expect(aiSettings(catalog, world.settings)).toMatchObject({ "@ex/u:open": 1 })
  expect(aiSettings(catalog, world.settings)).not.toHaveProperty("@ex/u:secret")
  const shown = catalog.actions.get("@matomezu/base:settings-set")?.describeArgs?.(catalog)
  expect(JSON.stringify(z.toJSONSchema(shown as z.ZodType))).not.toContain("@ex/u:secret")
})

test("値の形は機能台帳から組み立て（言語は入れてある言語パックのどれか）、選んでいなければ・使えなければ既定の言語", () => {
  const ja = { "@matomezu/base:lang": "matomezu:ja" }
  expect(langOf(CORE_CATALOG, ja, "en")).toBe("ja")
  expect(langOf(CORE_CATALOG, { "@matomezu/base:lang": "ex:xx" }, "en")).toBe("en")
  expect(langOf(CORE_CATALOG, {}, "ja")).toBe("ja")
  expect(userSetting(CORE_CATALOG, { "@matomezu/base:skin": "nope" }, "@matomezu/base:skin")).toBe("auto")
  expect(userSetting(CORE_CATALOG, {}, "@ex/gone:x")).toBeUndefined()
})

test("役と userOnly は利用者の設定の項目だけが持ち、1 つの役は 1 つの項目だけ。ブックの設定の項目と同じ id は持てない", () => {
  const lang = BUILTIN_PARTS.userSettings.find(d => d.role === "lang") as SettingDef
  const codes = (parts: Partial<typeof BUILTIN_PARTS>) =>
    checkCoreCatalog({ ...BUILTIN_PARTS, ...parts }).map(p => p.code)
  expect(codes({ userSettings: [...BUILTIN_PARTS.userSettings, { ...lang, id: "@ex/u:lang2" }] })).toEqual(["E037"])
  expect(codes({ settings: [...BUILTIN_PARTS.settings, { ...OPEN, role: "skin" }] })).toEqual(["E036"])
  expect(codes({ settings: [...BUILTIN_PARTS.settings, { ...OPEN, userOnly: true }] })).toEqual(["E036"])
  expect(codes({ userSettings: [...BUILTIN_PARTS.userSettings, BUILTIN_PARTS.settings[0] as SettingDef] })).toEqual([
    "E001",
  ])
  // 役の無い組み立ても作れる（土台は既定で読む）
  expect(buildCoreCatalog({ ...BUILTIN_PARTS, userSettings: [] }).roles.size).toBe(0)
})

test("追加プラグインの項目は役を持てない", () => {
  const bad: Plugin = { id: "@ex/r", userSettings: [{ ...OPEN, id: "@ex/r:lang", role: "lang" }] }
  expect(() => assemble([...BUILTIN, bad])).toThrow("E309")
})

test("選択肢の名前（optionTitles）の文言の鍵が文言に無ければ、組み立てで誤り", () => {
  const named: Plugin = {
    id: "@ex/o",
    userSettings: [{ ...OPEN, id: "@ex/o:mode", schema: z.enum(["a"]), optionTitles: { a: "@ex/o:none" } }],
  }
  expect(() => assemble([...BUILTIN, named])).toThrow("E018")
})
