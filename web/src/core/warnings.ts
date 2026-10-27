// warning の表: 止めるほどではない間違い。止めずに、その物（定義の 1 行・ブック 1 冊・画面が組めずに外した追加プラグインなど）だけを効かなくする。
// error（core/errors.ts）と違い、止めない（インスタンスは作り、ほかは動く）。
// 番号は一度付けたら変えず、消した番号も使い回さない。文は開発者に向けたもので、画面には出さない。{name} は渡す値で置き換える
export const WARNINGS = {
  W001: "bookType {type}: without names {action}, which is not attached to it",
  W002: "bookType {type}: add names {action}, which is already attached to it",
  W003: "command {command}: performs {action}, which is not in the catalog",
  W004: "book {book} ({title}): its type {type} is not in the catalog",
  W005: "book {book} ({title}): it does not fit its type {type}",
  W006: "book {book} ({title}): it breaks the rules of its type {type}",
  W007: "book {book} ({title}): it has {missing}, not in the catalog (kept as they are)",
  W008: "key {key} in {scope} for {command}: a builtin plugin's key is there (not used)",
  W009: "key {key} in {scope} for {command}: another added plugin {other} has the same key (neither is used)",
  W010: "layout {layout}: {kind} {id} is skipped, as its plugin is not there",
  W011: "the screen did not add it ({reason}); its actions still work on the host, but nothing it draws is shown",
} as const

export type WarningCode = keyof typeof WARNINGS

// 1 つの warning: 種類（番号）・どのプラグインの warning か・文に埋める値
export interface Warning {
  code: WarningCode
  plugin: string
  params: Readonly<Record<string, string>>
}

export const warning = (code: WarningCode, plugin: string, params: Readonly<Record<string, string>>): Warning => ({
  code,
  plugin,
  params,
})

// 開発者に見せる 1 行（番号と文。常駐のログなど）
export function warningText(n: Warning): string {
  const text = WARNINGS[n.code].replace(/\{(\w+)\}/g, (whole, name: string) => n.params[name] ?? whole)
  return `${n.code} ${n.plugin}: ${text}`
}
