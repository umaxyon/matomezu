// warning の表: 止めるほどではない間違い。止めずに、その物（定義の 1 行・ブック 1 冊・画面が組めずに外した追加プラグインなど）だけを効かなくする。
// error（core/errors.ts）と違い、止めない（インスタンスは作り、ほかは動く）。
// 番号は一度付けたら変えず、消した番号も使い回さない。文は開発者に向けたもので、画面には出さない。{name} は渡す値で置き換える
export const WARNINGS = {
  W001: "pageType {type}: without names {action}, which is not attached to it",
  W002: "pageType {type}: add names {action}, which is already attached to it",
  W003: "command {command}: performs {action}, which is not in the catalog",
  W004: "book {book} ({title}): it has a page of type {type}, which is not in the catalog",
  W005: "book {book} ({title}): it does not fit the shape of a book",
  W006: "book {book} ({title}): it breaks the rules of its lineup or of a page type",
  W007: "book {book} ({title}): it has {missing}, not in the catalog (kept as they are)",
  W008: "key {key} in {scope} for {command}: a builtin plugin's key is there (not used)",
  W010: "layout {layout}: {kind} {id} is skipped, as its plugin is not there",
  W011: "the screen did not add it ({reason}); its actions still work on the host, but nothing it draws is shown",
  W012: "tool {tool}: performs {action}, which is not in the catalog",
  W013: "controlCenter {controlCenter}: fixedUserSettings names {setting}, which is not a user setting",
  W014: "theme {theme}: textColors names {textColor}, which is not in the catalog",
  W015: "theme {theme}: token {token} is {value}, which is not {expected} (not used)",
  W016: "widget {widget}: place names {target} in slot {slot}, which is not there (not placed)",
  W017: "widget {widget}: place in slot {slot} names both before and after (not placed)",
  W018: "book {book} ({title}): annotation {id} is a {annotation}, which is not in the catalog (kept as it is, not used)",
  W019: "book {book} ({title}): annotation {id} does not fit {annotation} (kept as it is, not used)",
  W020: "theme {theme}: token {token} is {light} when light and {dark} when dark, but only colors can differ (it does not work)",
  W021: "key {key} in {scope} for {command}: added plugin {other}'s key is there first (not used)",
  W022: "mail {id} is a {mail}, which is not in the catalog (kept as it is, shown as mail)",
  W023: "mail {id} does not fit {mail} (kept as it is, shown as mail)",
  W024: "record {id} is a {subject}, which is not in the catalog (kept as it is, not used)",
  W025: "record {id} does not fit {subject} (kept as it is, not used)",
  W026: "enum value {id}: its enum {enum} is not in the catalog (not used)",
  W027: "book {book} ({title}): {pages} page(s) are of type {type}, which is not in the catalog (kept as they are, not readable)",
  W028: "book {book} ({title}): {pages} page(s) do not fit the shape of their type (kept as they are, not readable)",
  W029: "book {book} ({title}): {pages} page(s) break the rules of their type (kept as they are, not readable)",
  W030: "the library: its home and folders break the rules of the tree (kept as they are; actions on the library are refused)",
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
