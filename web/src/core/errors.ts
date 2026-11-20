// matomezu の error の表。番号は一度付けたら変えず、消した番号も使い回さない（利用者が調べる手がかりと、テストの照合に使う）。
// 文は開発者に向けたもので、画面には出さない（画面の文言は i18n の表）。{name} は渡す値で置き換える。
// 番号の範囲: E0xx 定義の組の食い違い（機能台帳）、E1xx 表に無いものを引いた・前提の状態が無い、E2xx 画面の組み立て、E3xx プラグイン、E4xx ホストとブラウザとのやり取り
export const ERRORS = {
  E001: "{kind} {id}: id is registered twice",
  E004: "pageType {id}: unknown paper {paper}",
  E005: "pageType {id}: default paper {paper} is not allowed",
  E008: "pageType {id}: unknown {kind} {ref}",
  E010: "pageType {id}: unknown theme {theme}",
  E011: "{owner}: token {token} is declared twice",
  E012: "{owner}: token {token} falls back to unknown {fallback}",
  E014: "paper {id}: size must be portrait (w <= h)",
  E015: "core catalog has no page type",
  E016: "catalog has {count} problems",
  E017: "message {key} has different {lang} translations",
  E018: "{kind} {id}: title {title} is not in the messages",
  E020: "language {lang} has different names",
  E021: "language packs give message {key} different {lang} translations",
  E022: "key {key} of command {command} cannot be read",
  E023: "key {key} in scope {scope} is bound twice by the built-in plugins",
  E024: "key {key} binds unknown command {command}",
  E026: "item {id}: unknown dialog {dialog}",
  E028: "item {id}: {field} names {prop}, which is not in its props",
  E029: "pageType {id}: options for item {ref}, which is not allowed",
  E030: "pageType {id}: fields must not have {field} (a page has it already)",
  E031: "pageType {id}: unknown dialog {dialog}",
  E032: "toolSet {id}: unknown tool {tool}",
  E033: "toolSet {id}: has no tools",
  E034: "textColor {id}: color {color} is not #rrggbb",
  E036: "setting {id}: only a user setting may have {field}",
  E037: "userSetting {id}: role {role} is held by {other} too",
  E038: "theme {id}: textColors has {color} for {textColor}, which is not #rrggbb",
  E039: "pageType {id}: default theme {theme} is not one of the themes for its theme types",
  E040: "{kind} {id}: theme types must be {expected}",
  E041: "controlCenter {id}: unknown action {ref}",
  E042: "pageType {id}: slide has {ref}, which is not a shape item",
  E044: "action {id}: runsWhenAIJoins {role} is named by {other} too",
  E070: "action {id}: runsWhenAIEnds is named by {other} too",
  E071: "key {key} for {command}: neither its plugin nor the core has key scope {scope}",
  E072: "presentation {id}: key scope {scope} is not for stage commands (a presentation's key scope is looked up only while a stage draws it)",
  E073: "key {key} in {scope} binds {command}, a stage command, but the scope is for screen commands",
  E074: 'keyScope {id}: commandsFrom must be "stage" or "screen" (it is {value})',
  E075: "screen {id}: unknown library appearance {appearance}",
  E045: "subject {id}: record needs an id (a string)",
  E046: "action {id}: target {target} is not a subject",
  E047: "controlCenter {id}: unknown subject {ref}",
  E050: "subject {id}: role {role} is held by {other} too",
  E051: "subject {id}: role {role} needs {field} in its record",
  E056: "action {id}: writes {ref} is not a subject",
  E057: "action {id}: writes has the target {target} itself",
  E058: "action {id}: {ref} belongs to another plugin that does not allow it (writableBy)",
  E059: "action {id}: writes {ref}, which is numbered",
  E060: "action {id}: lockSwitch cannot have writes",
  E061: "subject {id}: aiListed and aiList cannot be given together",
  E062: "pageType {id}: settings has {setting}, which is not a page setting (its holder is not page)",
  E063: 'action {id}: its permissionScope is "book" (no page named), so its attach cannot have {attach} (they depend on a page type)',
  E064: "setting {id}: a page or book setting needs holder (page or outermost)",
  E065: "userSetting {id}: a user setting takes no holder",
  E066: 'pageType {id}: actions.{field} has {action}, whose permissionScope is "book" (it changes the container itself, so no page type decides it)',
  E048: "subject {id}: lockable needs a locked field in its record (true, optional)",
  E049: "action {id}: lockSwitch is only for an action whose target is a lockable subject",
  E052: "skin {id}: palette has {color} for {role}, which is not #rrggbb",
  E053: "enum value {id}: data does not fit the value of enum {enum}",
  E054: "screen arrangement {id}: atStart is held by {other} too",
  E055: "screen {id}: stages is held by {other} too",

  E101: "unknown page type: {id}",
  E102: "unknown theme: {id}",
  E105: "no current stage: {id}",
  E107: "unknown command: {id}",
  E108: "unknown dialog: {id}",
  E109: "no view for {kind} {id}",
  E110: "unknown control center: {id}",
  E111: "auto skin {id} is not a {scheme} skin",
  E112: "could not make a new id",
  E113: "unknown setting: {id}",
  E114: "unknown tool set: {id}",
  E115: "unknown tool: {id}",
  E116: "the command context was not made by matomezu (a copy of it does not carry the workspace)",
  E117: "the window has no book screen numbered {index}",
  E122: "unknown plugin state: {id}",
  E123: "plugin state {id}: the value does not fit its schema",
  E124: "plugin state {id} is a {scope} state: {need}",
  E125: "plugin state {id} belongs to another plugin than {owner}",
  E126: "this view is not drawn in a screen of {screen}",
  E127: "item {id}: scrapFrame is for a shape whose props are a scrap",
  E128: "{name} is used outside a screen arrangement (only the widget that lays out the screens names them)",
  E129: "setting {id}: printPreview is only for a setting a book holds (holder outermost)",

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
  E308: "plugin {plugin}: only built-in plugins may have checks",
  E309: "plugin {plugin}: only built-in plugins may give a user setting a role ({id})",
  E310: "plugin {plugin}: only built-in plugins may have normalize steps",
  E311: "plugin {plugin}: only built-in plugins may have control centers",
  E312: "plugin {plugin}: widget {id} is for the kind {kind}, which the plugin does not own (only the owner of a kind may add a widget for it)",
  E313: "plugin {plugin}: pageTypeIcons has {id}, which is not its own page type",
  E314: "plugin {plugin}: enumValueIcons has {id}, which is not its own enum value",
  E315: "plugin {plugin}: contextMenuRows has {id}, which is not its own context menu",
  E316: "plugin {plugin}: its ui entry must export the plugin with the id {plugin} as default (export default definePluginUi(...))",

  E401: "the server could not give the data: {status}",
  E402: "the server does not know this browser (run matomezu open in a terminal)",
  E403: "the server could not search: {status}",
} as const

export type ErrorCode = keyof typeof ERRORS

// 文の {name} の名前
type Names<S extends string> = S extends `${string}{${infer N}}${infer Rest}` ? N | Names<Rest> : never
export type ErrorParams<C extends ErrorCode> = Readonly<Record<Names<(typeof ERRORS)[C]>, string | number>>
// 値を渡す error には値を、渡さない error には何も渡さない
type ParamsArg<C extends ErrorCode> = [Names<(typeof ERRORS)[C]>] extends [never] ? [] : [ErrorParams<C>]

// 起きた error 1 つ（番号と、文に入れる値）
export interface Problem {
  code: ErrorCode
  params: Readonly<Record<string, string | number>>
}

export function problem<C extends ErrorCode>(code: C, ...params: ParamsArg<C>): Problem {
  return { code, params: params[0] ?? {} }
}

// 「E004 pageType drawing: unknown paper a3」の形の文
export function problemText(p: Problem): string {
  const text = (ERRORS[p.code] as string).replace(/\{(\w+)\}/g, (all, name: string) => String(p.params[name] ?? all))
  return `${p.code} ${text}`
}

// 投げる error。code で見分け、details は束ねた error（定義の組の食い違いの一覧など）
export interface MatomezuError extends Error {
  code: ErrorCode
  details: readonly Problem[]
}

export function matomezuError(p: Problem, details: readonly Problem[] = []): MatomezuError {
  const lines = [problemText(p), ...details.map(d => `  ${problemText(d)}`)]
  return Object.assign(new Error(lines.join("\n")), { name: "MatomezuError", code: p.code, details })
}

// その場で投げる
export function fail<C extends ErrorCode>(code: C, ...params: ParamsArg<C>): never {
  throw matomezuError(problem(code, ...params))
}
