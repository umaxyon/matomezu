import { expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  binEntry,
  labVersion,
  mainPackageJson,
  OPENCODE_FILES,
  opencodePackageJson,
  platformPackageJson,
  platformPackageName,
  TARGETS,
  withPluginVersion,
} from "../../scripts/npm-pack/manifest"

test("内部のレジストリで試す版は、時刻から決まり、利用者向けの版（latest）と区別できる", () => {
  expect(labVersion(new Date("2026-11-14T10:20:30Z"))).toBe("0.0.0-lab.261114102030")
  expect(labVersion(new Date("2026-11-14T10:20:31Z"))).not.toBe(labVersion(new Date("2026-11-14T10:20:30Z")))
})

test("本体は、実行ファイルのパッケージを全部、同じ版で optionalDependencies に持つ", () => {
  const main = mainPackageJson("1.2.3")
  expect(Object.keys(main.optionalDependencies)).toEqual(TARGETS.map(platformPackageName))
  expect(new Set(Object.values(main.optionalDependencies))).toEqual(new Set(["1.2.3"]))
  expect(main.files).toContain("plugin")
  expect(main.files).toContain("codex-plugin")
})

test("実行ファイルのパッケージは、その OS と CPU のときだけ入る", () => {
  const t = TARGETS.find(x => x.os === "win32")
  if (!t) throw new Error("no win32")
  expect(platformPackageJson(t, "1.2.3")).toMatchObject({
    name: "@matomezu/cli-win32-x64",
    os: ["win32"],
    cpu: ["x64"],
  })
})

test("プラグインの版を本体の版に書き換える", () => {
  const out = withPluginVersion('{"name":"matomezu","version":"0.1.0"}', "9.9.9")
  expect(JSON.parse(out)).toEqual({ name: "matomezu", version: "9.9.9" })
})

test("入口は、親をたどるときに飛ばす入口として、自分のプロセス id を実行ファイルに環境変数で伝える", () => {
  expect(binEntry).toContain("MATOMEZU_ENTRY_PID: String(process.pid)")
})

test("入口は、本体のパッケージのフォルダ（プラグインの置き場所）を実行ファイルに環境変数で伝える", () => {
  expect(binEntry).toContain('MATOMEZU_PACKAGE_DIR: require("node:path").join(__dirname, "..")')
})

test("opencode のプラグインは、本体と同じ版の別のパッケージで、サーバーと TUI の入口と、それらが読むファイルを持つ", () => {
  const pkg = opencodePackageJson("1.2.3")
  expect(pkg).toMatchObject({ name: "matomezu-opencode", version: "1.2.3", main: "index.ts", type: "module" })
  expect(pkg.files).toEqual(OPENCODE_FILES)
  const dir = join(import.meta.dir, "../../clients/opencode")
  for (const f of OPENCODE_FILES) expect(existsSync(join(dir, f))).toBe(true)
  // 入れたファイルが読む、同じフォルダのファイルも入っている
  for (const f of OPENCODE_FILES) {
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(/from "\.\/([^"]+)"/g))
      expect(OPENCODE_FILES).toContain(`${m[1]}.ts`)
  }
})
