// 利用者の設定のアクション: 書いた項目の値だけを丸ごと置き換える。使えるか（ホームのタイプが変えさせない項目・AI に利用者だけの項目）は、
// 許可の範囲の項目ごとに土台が問う（core/inspect.ts）
import { z } from "zod"
import { settingSchema } from "../../../core/settings"
import { kit } from "../kit"

export const SETTINGS_SET = kit.defineAction({
  id: "settings-set",
  aiDescription:
    "Change the user's settings: values are keyed by the ids of settings in actions, and each value replaces the setting as a whole (to change a part, read it with read_settings first and give it back with your change). null puts the setting back to its default. Only the settings given change. A setting it does not have, a value of the wrong shape, or a setting the user's home keeps fixed is refused.",
  title: "Settings",
  target: "settings",
  permissionScope: { settings: "values" },
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
  // 無い項目・形の合わない値があれば、どれも変えずに断る
  run: (settings, args, ctx) => {
    const next: Record<string, unknown> = { ...settings }
    for (const [id, value] of Object.entries(args.values)) {
      const def = ctx.catalog.userSettings.get(id)
      if (!def) return null
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
