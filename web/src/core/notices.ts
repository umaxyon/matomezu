// 注意の表: 組み立てで見つけた、止めるほどではない間違い（その行だけ効かない）。誤り（core/errors.ts）と違い、インスタンスは作る。
// 番号は一度付けたら変えず、消した番号も使い回さない。文は開発者に向けたもので、画面には出さない。{name} は渡す値で置き換える
export const NOTICES = {
  N001: "bookType {type}: without names {action}, which is not attached to it",
  N002: "bookType {type}: add names {action}, which is already attached to it",
  N003: "command {command}: performs {action}, which is not in the catalog",
  N004: "book {book} ({title}): its type {type} is not in the catalog",
  N005: "book {book} ({title}): it does not fit its type {type}",
  N006: "book {book} ({title}): it breaks the rules of its type {type}",
  N007: "book {book} ({title}): it has {missing}, not in the catalog (kept as they are)",
  N008: "key {key} in {scope} for {command}: a builtin plugin's key is there (not used)",
  N009: "key {key} in {scope} for {command}: another added plugin {other} has the same key (neither is used)",
  N010: "layout {layout}: {kind} {id} is skipped, as its plugin is not there",
  N011: "the screen did not add it ({reason}); its actions still work on the host, but nothing it draws is shown",
} as const

export type NoticeCode = keyof typeof NOTICES

// 1 つの注意: 種類（番号）・どのプラグインの注意か・文に埋める値
export interface Notice {
  code: NoticeCode
  plugin: string
  params: Readonly<Record<string, string>>
}

export const notice = (code: NoticeCode, plugin: string, params: Readonly<Record<string, string>>): Notice => ({
  code,
  plugin,
  params,
})

// 開発者に見せる 1 行（番号と文。常駐のログなど）
export function noticeText(n: Notice): string {
  const text = NOTICES[n.code].replace(/\{(\w+)\}/g, (whole, name: string) => n.params[name] ?? whole)
  return `${n.code} ${n.plugin}: ${text}`
}
