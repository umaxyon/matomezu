// 利用者の設定の項目: プラグインの userSettings が持ち、settings-set で変える。role は土台が読む項目の印で、ビルトインプラグインだけが持てる

import { expect, test } from "bun:test"
import { z } from "zod"
import { type Actor, AI, USER } from "../../web/src/core/actor"
import { buildCoreCatalog, checkCoreCatalog } from "../../web/src/core/core-catalog"
import type { HeldSettingDef, UserSettingDef } from "../../web/src/core/def/setting"
import { performIn } from "../../web/src/core/perform"
import {
  aiSettings,
  disabledPluginsOf,
  isParticipantAlive,
  langOf,
  participantAliveMs,
  userSetting,
} from "../../web/src/core/settings"
import { BUILTIN } from "../../web/src/plugins"
import { assemble, type Plugin } from "../../web/src/store/plugin"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

// 利用者だけが変える項目を 1 つ持つ追加プラグイン
const SECRET: UserSettingDef = {
  id: "@ex/u:secret",
  title: "@matomezu/base:Language",
  schema: z.string(),
  default: "none",
  userOnly: true,
}
const OPEN: UserSettingDef = { id: "@ex/u:open", title: "@matomezu/base:Language", schema: z.number(), default: 1 }
const EX: Plugin = { id: "@ex/u", userSettings: [SECRET, OPEN] }

const ctx = (catalog = CORE_CATALOG, actor: Actor = USER) => ({
  catalog,
  controlCenter: "@matomezu/control-center:control-center",
  lang: "en",
  newId: () => "x",
  now: "2026-10-29T00:00:00.000Z",
  today: "2026-10-29",
  actor,
})

test("利用者だけが変える項目は、AI には変えさせず、AI が読む設定と AI に見せる引数の形にも出さない", () => {
  const catalog = assemble([...BUILTIN, EX], "@matomezu/control-center:control-center").catalog.core
  const world = {
    pages: {},
    folders: {},
    settings: { "@ex/u:secret": "s" },
    annotations: {},
    participants: [],
    records: {},
    counters: {},
  }
  const set = (values: Record<string, unknown>, actor?: Actor) =>
    performIn(world, "@matomezu/base:settings-set", { values }, undefined, ctx(catalog, actor)).ok
  expect(set({ "@ex/u:secret": "t" })).toBe(true)
  expect(set({ "@ex/u:secret": "t" }, AI)).toBe(false)
  // 断りには、利用者だけが変える項目だと分かる理由が付く（利用者だけのアクションと同じ not-allowed）
  expect(
    performIn(world, "@matomezu/base:settings-set", { values: { "@ex/u:secret": "t" } }, undefined, ctx(catalog, AI)),
  ).toEqual({
    ok: false,
    reason: "not-allowed",
    setting: "@ex/u:secret",
    because: "user-only",
  })
  expect(set({ "@ex/u:open": 2 }, AI)).toBe(true)
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

test("role と userOnly は利用者の設定の項目だけが持ち、1 つの role は 1 つの項目だけ。ブックの設定の項目と同じ id は持てない", () => {
  const lang = BUILTIN_PARTS.userSettings.find(d => d.role === "lang") as UserSettingDef
  const codes = (parts: Partial<typeof BUILTIN_PARTS>) =>
    checkCoreCatalog({ ...BUILTIN_PARTS, ...parts }).map(p => p.code)
  expect(codes({ userSettings: [...BUILTIN_PARTS.userSettings, { ...lang, id: "@ex/u:lang2" }] })).toEqual(["E037"])
  expect(
    codes({ settings: [...BUILTIN_PARTS.settings, { ...OPEN, holder: "page", role: "skin" } as HeldSettingDef] }),
  ).toEqual(["E036"])
  expect(
    codes({ settings: [...BUILTIN_PARTS.settings, { ...OPEN, holder: "page", userOnly: true } as HeldSettingDef] }),
  ).toEqual(["E036"])
  // ページの設定の項目と同じ id の利用者の設定の項目は E001（holder を外しても同じ）
  const { holder: _, ...same } = BUILTIN_PARTS.settings[0]!
  expect(codes({ userSettings: [...BUILTIN_PARTS.userSettings, same as UserSettingDef] })).toEqual(["E001"])
  // role の無い台帳アセンブルもできる（土台は既定で読む）
  expect(buildCoreCatalog({ ...BUILTIN_PARTS, userSettings: [] }).roles.size).toBe(0)
})

test("追加プラグインの項目は role を持てない", () => {
  const bad: Plugin = { id: "@ex/r", userSettings: [{ ...OPEN, id: "@ex/r:lang", role: "lang" }] }
  expect(() => assemble([...BUILTIN, bad])).toThrow("E309")
})

test("選択肢の名前（optionTitles）の文言の鍵が文言に無ければ、台帳アセンブルで誤り", () => {
  const named: Plugin = {
    id: "@ex/o",
    userSettings: [{ ...OPEN, id: "@ex/o:mode", schema: z.enum(["a"]), optionTitles: { a: "@ex/o:none" } }],
  }
  expect(() => assemble([...BUILTIN, named])).toThrow("E018")
})

test("参加者が生きているとする長さは、role が participant-alive の項目（分の数）から決まる", () => {
  expect(participantAliveMs(CORE_CATALOG, {})).toBe(60 * 60_000)
  expect(participantAliveMs(CORE_CATALOG, { "@matomezu/base:participant-alive": "15" })).toBe(15 * 60_000)
  expect(participantAliveMs(CORE_CATALOG, { "@matomezu/base:participant-alive": "7" })).toBe(60 * 60_000)
})

test("参加者が生きているかは、最後に呼ばれた時刻から有効時間の設定以内。呼ばれていない・読めない時刻・形に合わない設定は既定の 60 分で決まる", () => {
  const now = Date.parse("2026-11-08T10:00:00.000Z")
  const alive = (calledAt: string | undefined, settings = {}) =>
    isParticipantAlive(CORE_CATALOG, settings, calledAt, now)
  expect(alive(undefined)).toBe(false)
  expect(alive("not a time")).toBe(false)
  expect(alive("2026-11-08T09:30:00.000Z")).toBe(true)
  expect(alive("2026-11-08T08:30:00.000Z")).toBe(false)
  expect(alive("2026-11-08T09:30:00.000Z", { "@matomezu/base:participant-alive": "15" })).toBe(false)
  expect(alive("2026-11-08T09:30:00.000Z", { "@matomezu/base:participant-alive": "7" })).toBe(true)
})

test("無効の（有効にしていない）追加プラグインの id の集合は、追加プラグインのうち、role が enabled-plugins の設定の値（形に合わない値は無し）に無い物。足したときは無効", () => {
  const added = ["@a/x", "@a/y"]
  const off = (value: unknown) => [
    ...disabledPluginsOf(CORE_CATALOG, { "@matomezu/base:enabled-plugins": value }, added),
  ]
  expect(off(["@a/x"])).toEqual(["@a/y"])
  expect(off(["@a/x", 3])).toEqual(["@a/x", "@a/y"]) // 形に合わない値は項目の既定（無し）
  expect([...disabledPluginsOf(CORE_CATALOG, {}, added)]).toEqual(["@a/x", "@a/y"])
  expect([...disabledPluginsOf(CORE_CATALOG, {}, [])]).toEqual([])
})
