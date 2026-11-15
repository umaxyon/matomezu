// 利用者に配る npm のパッケージを作り、あれば内部の npm レジストリ（Verdaccio）に出す。
// bun scripts/npm-pack.ts --out <作る先のフォルダ> [--version <版>] [--publish <publish 用の .npmrc>] [--target linux-x64]...
// 版は、無ければ時刻から決める（内部のレジストリで試す版）。--publish を付けると、publish してから latest をその版にする。
// 実行ファイルは、画面（web/dist）を埋め込む（ビルドタグ embed）。
// 作る物: <out>/matomezu（本体。bin/matomezu.js と、Claude Code のプラグイン plugin/ と Codex のプラグイン codex-plugin/）と <out>/cli-<os>-<cpu>（OS ごとの実行ファイル）。
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  binEntry,
  exeName,
  labVersion,
  mainPackageJson,
  platformPackageJson,
  platformPackageName,
  TARGETS,
  withPluginVersion,
} from "./npm-pack/manifest"

const arg = (name: string) => {
  const at = process.argv.indexOf(name)
  return at < 0 ? undefined : process.argv[at + 1]
}
const args = (name: string) => process.argv.flatMap((a, i) => (a === name ? [process.argv[i + 1]] : []))

const out = arg("--out")
if (!out) {
  console.error("--out <folder> is needed")
  process.exit(2)
}
const version = arg("--version") ?? labVersion(new Date())
const npmrc = arg("--publish")
const only = args("--target")
const targets = only.length === 0 ? TARGETS : TARGETS.filter(t => only.includes(`${t.os}-${t.cpu}`))

const run = async (cmd: string[], env: Record<string, string> = {}) => {
  const code = await Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit", env: { ...process.env, ...env } }).exited
  if (code !== 0) process.exit(code)
}
const writeJson = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)

rmSync(out, { recursive: true, force: true })
await run(["bun", "run", "build"])
for (const t of targets) {
  const dir = join(out, `cli-${t.os}-${t.cpu}`)
  mkdirSync(join(dir, "bin"), { recursive: true })
  await run(
    [
      "go",
      "build",
      "-trimpath",
      "-tags",
      "embed",
      "-ldflags",
      `-s -w -X main.version=${version}`,
      "-o",
      join(dir, "bin", exeName(t)),
      "./cmd/matomezu",
    ],
    { CGO_ENABLED: "0", GOOS: t.goos, GOARCH: t.goarch },
  )
  writeJson(join(dir, "package.json"), platformPackageJson(t, version))
}
const main = join(out, "matomezu")
mkdirSync(join(main, "bin"), { recursive: true })
writeFileSync(join(main, "bin", "matomezu.js"), binEntry)
chmodSync(join(main, "bin", "matomezu.js"), 0o755)
cpSync("clients/claude-code", join(main, "plugin"), { recursive: true })
// Codex のプラグイン。deliver は本体の実行ファイルに組み込む Go のパッケージなので入れない
cpSync("clients/codex", join(main, "codex-plugin"), {
  recursive: true,
  filter: src => !src.startsWith(join("clients", "codex", "deliver")),
})
for (const pluginJson of [
  join(main, "plugin", ".claude-plugin", "plugin.json"),
  join(main, "codex-plugin", ".codex-plugin", "plugin.json"),
])
  writeFileSync(pluginJson, withPluginVersion(readFileSync(pluginJson, "utf8"), version))
writeJson(join(main, "package.json"), mainPackageJson(version, targets))
console.log(`built ${version} in ${out}`)

if (npmrc) {
  const registry = readFileSync(npmrc, "utf8").match(/^registry=(.+)$/m)?.[1]
  if (!registry) throw new Error(`${npmrc} has no registry=`)
  const publish = (dir: string) =>
    run(["npm", "publish", dir, "--userconfig", npmrc, "--registry", registry, "--tag", "lab", "--access", "public"])
  for (const t of targets) await publish(join(out, `cli-${t.os}-${t.cpu}`))
  await publish(main)
  for (const name of ["matomezu", ...targets.map(platformPackageName)])
    await run(["npm", "dist-tag", "add", `${name}@${version}`, "latest", "--userconfig", npmrc, "--registry", registry])
  console.log(`published ${version} to ${registry}`)
}
