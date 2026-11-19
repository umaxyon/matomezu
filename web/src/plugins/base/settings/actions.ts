// 利用者の設定のアクション: 書いた項目の値だけを丸ごと置き換える。使えるか（コントロールセンターが変えさせない項目・AI に利用者だけの項目）は、
// 許可スコープの項目ごとに土台が問う（core/inspect.ts）
import { z } from "zod"
import { langChosen, settingSchema } from "../../../core/settings"
import { kit } from "../kit"
import { LANG } from "./user-settings"

export const SETTINGS_SET = kit.defineAction({
  id: "settings-set",
  aiDescription:
    "Change the user's settings: values are keyed by the ids of settings in actions, and each value replaces the setting as a whole (to change a part, read it with read_settings first and give it back with your change). null puts the setting back to its default. Only the settings given change. A setting it does not have, a value of the wrong shape, or a setting the control center keeps fixed is refused.",
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
            .map(d => [d.id, settingSchema(catalog, d, "user").nullable().optional()]),
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
      const parsed = settingSchema(ctx.catalog, def, "user").safeParse(value)
      if (!parsed.success) return null
      next[id] = parsed.data
    }
    return { next, result: {} }
  },
})

// 窓の言語を、言語の項目（LANG）がまだ選ばれていないときだけ、利用者の設定に書く（窓の言語の言語パックが無ければ書かない）。
// 窓を開いたときに、窓が行う。言語の違う窓が 2 つ開いても、後の窓は先に書いた言語を変えない
export const LANG_ADOPT = kit.defineAction({
  id: "lang-adopt",
  title: "Language", // 言語の項目と同じ名前
  aiDescription:
    "Set the language setting to the language of the user's window, only while no language is chosen. matomezu does this by itself when a window opens; only the user can do this.",
  target: "settings",
  userOnly: true,
  history: false, // 利用者の操作でなく、窓を開いたときに書く
  runsAtWindowStart: true,
  permissionScope: () => [LANG.id],
  args: z.strictObject({}),
  run: (settings, _args, ctx) => {
    const pack = [...ctx.catalog.languagePacks.values()].find(p => p.lang === ctx.lang)?.id
    if (langChosen(ctx.catalog, settings) || pack === undefined) return { next: settings, result: {} }
    return { next: { ...settings, [LANG.id]: pack }, result: {} }
  },
})
