// 利用者の設定のアクション: 書いた項目の値だけを丸ごと置き換える。使えるか（コントロールセンターが変えさせない項目・AI に利用者だけの項目）は、
// 許可スコープの項目ごとに土台が問う（core/inspect.ts）
import { z } from "zod"
import { settingSchema } from "../../../core/settings"
import { kit } from "../kit"

export const SETTINGS_SET = kit.defineAction({
  id: "settings-set",
  aiDescription:
    "Change the user's settings: values are keyed by the ids of settings in actions, and each value replaces the setting as a whole (to change a part, read it with read_settings first and give it back with your change). null puts the setting back to its default. Only the settings given change. With only set to unset, a setting that already has a value is left as it is (only the settings without a value are written; null then changes nothing). A setting it does not have, a value of the wrong shape, or a setting the control center keeps fixed is refused.",
  title: "Settings",
  target: "settings",
  permissionScope: { settings: "values" },
  // only が "unset" なら、値がまだ無い項目だけを書き、在る値は変えない
  args: z.strictObject({ values: z.record(z.string(), z.unknown()), only: z.literal("unset").optional() }),
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
      only: z.literal("unset").optional(),
    }),
  // 窓を開いたとき: 言語の項目（role が lang）に、窓の言語の言語パックを、まだ値が無いときだけ書く（その言語パックが機能台帳に無ければ行わない）。
  // 言語の違う窓が 2 つ開いても、後の窓は先に書いた言語を変えない
  runsAtWindowStart: (window, catalog) => {
    const lang = catalog.roles.get("lang")
    const pack = [...catalog.languagePacks.values()].find(p => p.lang === window.lang)?.id
    return lang && pack !== undefined ? { values: { [lang.id]: pack }, only: "unset" as const } : null
  },
  // 無い項目・形の合わない値があれば、どれも変えずに断る（only が "unset" で書かない項目も確かめる）
  run: (settings, args, ctx) => {
    const next: Record<string, unknown> = { ...settings }
    for (const [id, value] of Object.entries(args.values)) {
      const def = ctx.catalog.userSettings.get(id)
      if (!def) return null
      const parsed = value === null ? undefined : settingSchema(ctx.catalog, def, "user").safeParse(value)
      if (parsed && !parsed.success) return null
      // 値が在るかは、機能台帳で読めるかによらず、項目の id が在るかで見る（機能台帳に無い言語パックを選んだ値も、在る値として残す。langChosen と同じ）
      if (args.only === "unset" && id in settings) continue
      if (!parsed) {
        delete next[id]
        continue
      }
      next[id] = parsed.data
    }
    return { next, result: {} }
  },
})
