// matomezu の MCP の道具の見分け方。MCP を直に登録したときと、Claude Code のプラグインから入れたときで道具名の前置きが違う
const PREFIXES = ["mcp__matomezu__", "mcp__plugin_matomezu_matomezu__"]
// MCP の説明の見出しのサーバー名（英数字以外を _ にし小文字にした形）
export const MATOMEZU_SERVERS = new Set(["matomezu", "plugin_matomezu_matomezu"])

// matomezu の道具なら前置きを外した名前（actions など）、違えば undefined
export function matomezuTool(name: string): string | undefined {
  const prefix = PREFIXES.find(p => name.startsWith(p))
  return prefix ? name.slice(prefix.length) : undefined
}

export const isMatomezuTool = (name: string) => matomezuTool(name) !== undefined

// Codex が道具をサーバーごとにまとめる名前空間の名前（mcp__<サーバー>）が matomezu のものか
export const isMatomezuNamespace = (name: string) => PREFIXES.some(p => `${name}__` === p)
