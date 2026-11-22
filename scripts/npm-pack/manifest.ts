// npm で配るパッケージの中身を決める（作る・publish するのは scripts/npm-pack.ts）。
// 本体の matomezu は、OS と CPU ごとの実行ファイルのパッケージ（@matomezu/cli-<os>-<cpu>）を optionalDependencies に持ち、入口の bin/matomezu.js が合う物を探して動かす。
// Claude Code のプラグイン（clients/claude-code）は、実行ファイルと同じ版で配るため本体の plugin/ に入れる。
// opencode のプラグイン（clients/opencode）は、opencode が npm のパッケージとして入れるので、別のパッケージ matomezu-opencode にして本体と同じ版で配る。

/** 実行ファイルを作る先 1 つ。os・cpu は npm（process.platform・process.arch）の呼び名、goos・goarch は Go の呼び名 */
export type Target = { os: string; cpu: string; goos: string; goarch: string }

export const TARGETS: Target[] = [
  { os: "linux", cpu: "x64", goos: "linux", goarch: "amd64" },
  { os: "linux", cpu: "arm64", goos: "linux", goarch: "arm64" },
  { os: "darwin", cpu: "x64", goos: "darwin", goarch: "amd64" },
  { os: "darwin", cpu: "arm64", goos: "darwin", goarch: "arm64" },
  { os: "win32", cpu: "x64", goos: "windows", goarch: "amd64" },
]

export const platformPackageName = (t: Target) => `@matomezu/cli-${t.os}-${t.cpu}`

export const exeName = (t: Target) => (t.os === "win32" ? "matomezu.exe" : "matomezu")

/** 利用者向けの版（0.1.0 など）と区別できる、内部の npm レジストリで試す版。時刻から決めるので、publish のたびに新しくなる */
export const labVersion = (now: Date) => `0.0.0-lab.${now.toISOString().replace(/\D/g, "").slice(2, 14)}`

export const platformPackageJson = (t: Target, version: string) => ({
  name: platformPackageName(t),
  version,
  description: `matomezu executable (${t.os} ${t.cpu})`,
  os: [t.os],
  cpu: [t.cpu],
  files: ["bin"],
  preferUnplugged: true,
})

export const mainPackageJson = (version: string, targets: Target[] = TARGETS) => ({
  name: "matomezu",
  version,
  description: "A diagram editor where AI and people look at the same book and fix it together",
  bin: { matomezu: "bin/matomezu.js" },
  files: ["bin", "plugin", "codex-plugin"],
  optionalDependencies: Object.fromEntries(targets.map(t => [platformPackageName(t), version])),
})

/** opencode のプラグインのパッケージに入れるファイル（clients/opencode の中。サーバーの入口 index.ts と TUI の入口 tui.ts、それらが読む物） */
export const OPENCODE_FILES = ["index.ts", "matomezu.ts", "names.ts", "tui.ts"]

export const opencodePackageJson = (version: string) => ({
  name: "matomezu-opencode",
  version,
  description:
    "matomezu for opencode: the MCP tools, the hooks that tell matomezu the user talked to AI, and the wake notices",
  type: "module",
  main: "index.ts",
  files: OPENCODE_FILES,
})

/** プラグインの plugin.json の版を、本体の版に合わせる（版が同じままだと、入れ済みのプラグインに更新が届かないため） */
export const withPluginVersion = (pluginJson: string, version: string) => {
  const j = JSON.parse(pluginJson) as { version?: string }
  j.version = version
  return `${JSON.stringify(j, null, 2)}\n`
}

/** 写した実行ファイルの置き場（ホームの下。保管庫フォルダの場所 MATOMEZU_HOME には左右されない）。Go の側の home.BinDir と同じ */
export const BIN_DIR = [".matomezu", "bin"]
/** 置き場の中の、今入っている版の印のファイル。Go の側の home.InstalledName と同じ */
export const INSTALLED_NAME = "installed.json"

/** 本体の入口: OS と CPU に合うパッケージの実行ファイルを、版ごとの置き場（BIN_DIR/<版>/）に写して、そこから動かす。
 * Windows では動いている実行ファイルを消せないので、npm のフォルダの中のまま動かすと、会話が動いている間は npm が古い版を消せず、版を上げられない（Volta で os error 5）。写せないときは、パッケージの物をそのまま動かす。
 * 写した物と版を印（INSTALLED_NAME）に書き、常駐はその版で立てる。
 * 実行ファイルは親をたどって AI のプログラムを探すので、飛ばしてよい入口の node として自分のプロセス id を伝える。
 * 本体のパッケージのフォルダ（AI のプラグインの置き場所。node の入れ方で場所が変わる）も伝える */
export const binEntry = `#!/usr/bin/env node
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const pkg = \`@matomezu/cli-\${process.platform}-\${process.arch}\`
const exe = process.platform === "win32" ? "matomezu.exe" : "matomezu"
let bin
try {
  bin = require.resolve(\`\${pkg}/bin/\${exe}\`)
} catch {
  console.error(\`matomezu: \${pkg} is not installed (this OS or CPU is not supported, or optional dependencies were skipped)\`)
  process.exit(1)
}
// 一時の名前に書いてから改名する（同時に何本動いても、半分だけ書かれた物を動かさない）
const put = (to, write) => {
  const tmp = \`\${to}.\${process.pid}.tmp\`
  write(tmp)
  try {
    fs.renameSync(tmp, to)
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    if (!fs.existsSync(to)) throw e
  }
}
const copied = () => {
  const version = require(path.join(__dirname, "..", "package.json")).version
  const dir = path.join(os.homedir(), ${JSON.stringify(BIN_DIR[0])}, ${JSON.stringify(BIN_DIR[1])})
  const to = path.join(dir, version, exe)
  if (!fs.existsSync(to)) {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    put(to, tmp => {
      fs.copyFileSync(bin, tmp)
      fs.chmodSync(tmp, 0o755)
    })
  }
  const mark = path.join(dir, ${JSON.stringify(INSTALLED_NAME)})
  const text = JSON.stringify({ version, exe: to })
  let was = ""
  try {
    was = fs.readFileSync(mark, "utf8")
  } catch {}
  if (was !== text) put(mark, tmp => fs.writeFileSync(tmp, text))
  return to
}
try {
  bin = copied()
} catch (e) {
  console.error(\`matomezu: could not copy the executable out of the package, so it runs from there: \${e.message}\`)
}
const r = spawnSync(bin, process.argv.slice(2), { stdio: "inherit", env: { ...process.env, MATOMEZU_ENTRY_PID: String(process.pid), MATOMEZU_PACKAGE_DIR: path.join(__dirname, "..") } })
process.exit(r.status ?? 1)
`
