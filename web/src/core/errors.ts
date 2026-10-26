// matomezu の誤りの表。番号は一度付けたら変えず、消した番号も使い回さない（利用者が調べる手がかりと、テストの照合に使う）。
// 文は開発者に向けたもので、画面には出さない（画面の文言は i18n の表）。{name} は渡す値で置き換える。
// 番号の範囲: E0xx 定義の組の食い違い（機能台帳）、E1xx 表に無いものを引いた・前提の状態が無い、E2xx 画面の組み立て、E3xx プラグイン、E4xx ホスト（外の世界とのやり取り）
export const ERRORS = {
  E001: "{kind} {id}: id is registered twice",
  E002: 'bookType {id}: schema.type must be the literal "{id}"',
  E004: "bookType {id}: unknown paper {paper}",
  E005: "bookType {id}: default paper {paper} is not allowed",
  E006: "bookType {id}: addFromTabs needs @matomezu/base:page-add to be usable in it",
  E007: "bookType {id}: create must return a book of the schema",
  E008: "bookType {id}: unknown {kind} {ref}",
  E009: "bookType {id}: default {kind} {ref} is not allowed",
  E010: "bookType {id}: unknown theme {theme}",
  E011: "{owner}: token {token} is declared twice",
  E012: "{owner}: token {token} falls back to unknown {fallback}",
  E014: "paper {id}: size must be portrait (w <= h)",
  E015: "core catalog has no book type",
  E016: "catalog has {count} problems",
  E017: "message {key} has different {lang} translations",
  E018: "{kind} {id}: title {title} is not in the messages",
  E019: "bookType {id}: book must be a book of the schema whose id is {id}",
  E020: "language {lang} has different names",
  E021: "language packs give message {key} different {lang} translations",
  E022: "key {key} of command {command} cannot be read",
  E023: "key {key} in scope {scope} is bound twice by the built-in plugins",
  E024: "key {key} binds unknown command {command}",
  E025: "bookType {id}: schema must not have {field} (the catalog adds it)",
  E026: "item {id}: unknown dialog {dialog}",
  E028: "item {id}: themeProp names {prop}, which is not in its props",

  E101: "unknown book type: {id}",
  E102: "unknown theme: {id}",
  E103: "book type {type} has no pages",
  E104: "not a creatable book type: {type}",
  E105: "no current stage: {id}",
  E107: "unknown command: {id}",
  E108: "unknown dialog: {id}",
  E109: "no view for {kind} {id}",
  E110: "home {id} is not a single book type",
  E111: "auto skin {id} is not a {scheme} skin",
  E112: "could not make a new id",
  E113: "unknown setting: {id}",

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
  E211: "layout {layout}: slot {slot} is not opened by any placed widget",
  E212: "layout {layout}: menu {menu} is not shown by any placed widget",
  E213: "layout {layout}: context menu {menu} is not opened by any placed widget or book view",

  E301: 'plugin {plugin}: {kind} {id} must be "{plugin}:<name>" (a name of a-z, 0-9 and -, starting with a-z)',
  E302: "plugin {plugin}: key {key} binds {command}, which is not its own command",
  E303: 'plugin {plugin}: message key {key} must start with "{plugin}:"',
  E304: "plugin {plugin}: message {key} has no English text (en)",
  E305: "plugin {plugin}: name {name} must be of a-z, 0-9 and -, starting with a-z",
  E306: 'plugin {plugin}: token {token} must not start with "theme-" or "skin-" (the core\'s CSS variables)',
  E307: "plugin {plugin}: commandIcons has {command}, which is not its own command",

  E401: "the server could not give the data: {status}",
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
