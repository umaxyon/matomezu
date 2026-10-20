// matomezu の誤りの表。番号は一度付けたら変えず、消した番号も使い回さない（利用者が調べる手がかりと、テストの照合に使う）。
// 文は開発者に向けたもので、画面には出さない（画面の文言は i18n の表）。{name} は渡す値で置き換える。
// 番号の範囲: E0xx 定義の組の食い違い（登録表）、E1xx 表に無いものを引いた・前提の状態が無い、E2xx 画面の組み立て、E3xx プラグイン
export const ERRORS = {
  E001: "{kind} {id}: id is registered twice",
  E002: 'bookType {id}: schema.type must be the literal "{id}"',
  E003: "bookType {id}: pages must match whether schema has pages",
  E004: "bookType {id}: unknown paper {paper}",
  E005: "bookType {id}: default paper {paper} is not allowed",
  E006: "bookType {id}: addFromTabs needs page.add in the default actions",
  E007: "bookType {id}: create must return a book of the schema",
  E008: "bookType {id}: unknown {kind} {ref}",
  E009: "bookType {id}: default {kind} {ref} is not allowed",
  E010: "bookType {id}: unknown theme {theme}",
  E011: "{owner}: token {token} is declared twice",
  E012: "{owner}: token {token} falls back to unknown {fallback}",
  E013: "theme {id}: token {token} is not declared by any item or book type",
  E014: "paper {id}: size must be portrait (w <= h)",
  E015: "registry has no book type",
  E016: "registry has {count} problems",
  E017: "message {key} has different translations",
  E018: "{kind} {id}: title {title} is not in the messages",
  E019: "bookType {id}: book must be a book of the schema whose id is {id}",

  E101: "unknown book type: {id}",
  E102: "unknown theme: {id}",
  E103: "book type {type} has no pages",
  E104: "not a creatable book type: {type}",
  E105: "no current stage: {id}",
  E107: "unknown command: {id}",
  E108: "unknown dialog: {id}",
  E109: "no view for {kind} {id}",
  E110: "home {id} is not a single book type",

  E201: "MatomezuProvider is missing",
  E202: "#root is missing",
  E203: "plugin {plugin} has no views; pass the plugin wrapped by definePluginUi",
  E204: "plugin {plugin}: {kind} {id} has no view",
  E205: "plugin {plugin}: overrides unknown {kind} {id}",
  E206: "plugin {plugin}: {kind} {id} is overridden twice",
  E207: "layout {layout}: slot {slot} has unknown widget {widget}",
  E208: "layout {layout}: widget {widget} cannot be placed in slot {slot}",
  E209: "layout {layout}: menu {menu} has unknown command {command}",
  E210: "layout {layout} has {count} problems",

  E301: 'plugin {plugin}: {kind} {id} must start with "{plugin}/"',
} as const

export type ErrorCode = keyof typeof ERRORS

// 文の {name} の名前
type Names<S extends string> = S extends `${string}{${infer N}}${infer Rest}` ? N | Names<Rest> : never
export type ErrorParams<C extends ErrorCode> = Readonly<Record<Names<(typeof ERRORS)[C]>, string | number>>
// 値を渡す誤りには値を、渡さない誤りには何も渡さない
type ParamsArg<C extends ErrorCode> = [Names<(typeof ERRORS)[C]>] extends [never] ? [] : [ErrorParams<C>]

// 起きた誤り 1 つ（番号と、文に入れる値）
export interface Problem {
  code: ErrorCode
  params: Readonly<Record<string, string | number>>
}

export function problem<C extends ErrorCode>(code: C, ...params: ParamsArg<C>): Problem {
  return { code, params: params[0] ?? {} }
}

// 「E004 bookType drawing: unknown paper a3」の形の文
export function problemText(p: Problem): string {
  const text = (ERRORS[p.code] as string).replace(/\{(\w+)\}/g, (all, name: string) => String(p.params[name] ?? all))
  return `${p.code} ${text}`
}

// 投げる誤り。code で見分け、details は束ねた誤り（定義の組の食い違いの一覧など）
export interface MatomezuError extends Error {
  code: ErrorCode
  details: readonly Problem[]
}

export function matomezuError(p: Problem, details: readonly Problem[] = []): MatomezuError {
  const lines = [problemText(p), ...details.map(d => `  ${problemText(d)}`)]
  return Object.assign(new Error(lines.join("\n")), { name: "MatomezuError", code: p.code, details })
}

export function isMatomezuError(e: unknown): e is MatomezuError {
  return e instanceof Error && e.name === "MatomezuError" && typeof (e as { code?: unknown }).code === "string"
}

// その場で投げる
export function fail<C extends ErrorCode>(code: C, ...params: ParamsArg<C>): never {
  throw matomezuError(problem(code, ...params))
}
