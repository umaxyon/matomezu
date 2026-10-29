// 利用者の設定のアクション: 書いた項目の値だけを丸ごと置き換える。使えるかはホームのブックのタイプが決め、ホームのタイプが fixedSettings に挙げた項目は変えさせない
import { z } from "zod"
import type { CatalogCheck } from "../../../core/core-catalog"
import { problem } from "../../../core/errors"
import { settingSchema } from "../../../core/settings"
import { kit } from "../kit"

declare module "../../../core/catalog" {
  interface BookTypeExtras {
    // ホームにしたときに、利用者に変えさせない利用者の設定の項目の id（組織のホームで決める）
    fixedSettings?: readonly string[]
  }
}

export const SETTINGS_SET = kit.defineAction({
  id: "settings-set",
  aiDescription:
    "Change the user's settings: values are keyed by the ids of settings in actions, and each value replaces the setting as a whole (to change a part, read it with read_settings first and give it back with your change). null puts the setting back to its default. Only the settings given change. A setting it does not have, a value of the wrong shape, or a setting the user's home keeps fixed is refused.",
  title: "Settings",
  target: "settings",
  args: z.strictObject({ values: z.record(z.string(), z.unknown()) }),
  // AI に見せる形: AI が変えてよい項目ごとの値の形
  describeArgs: catalog =>
    z.strictObject({
      values: z.strictObject(
        Object.fromEntries(
          [...catalog.userSettings.values()]
            .filter(d => !d.userOnly)
            .map(d => [d.id, settingSchema(catalog, d).nullable().optional()]),
        ),
      ),
    }),
  // 無い項目・形の合わない値・ホームが変えさせない項目・AI が頼んだ利用者だけの項目があれば、どれも変えずに断る
  run: (settings, args, ctx) => {
    const fixed = (ctx.home !== null && ctx.catalog.bookTypes.get(ctx.home)?.fixedSettings) || []
    const next: Record<string, unknown> = { ...settings }
    for (const [id, value] of Object.entries(args.values)) {
      const def = ctx.catalog.userSettings.get(id)
      if (!def || fixed.includes(id) || (def.userOnly && ctx.by === "ai")) return null
      if (value === null) {
        delete next[id]
        continue
      }
      const parsed = settingSchema(ctx.catalog, def).safeParse(value)
      if (!parsed.success) return null
      next[id] = parsed.data
    }
    return { next, result: {} }
  },
})

// fixedSettings に挙げた id が、利用者の設定の項目か（組み立てのときの確かめ）
export const FIXED_SETTINGS_CHECK: CatalogCheck = catalog =>
  [...catalog.bookTypes.values()].flatMap(t =>
    (t.fixedSettings ?? [])
      .filter(id => !catalog.userSettings.has(id))
      .map(ref => problem("E008", { id: t.id, kind: "userSetting", ref })),
  )
