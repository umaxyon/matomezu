import { expect, test } from "bun:test"
import {
  labVersion,
  mainPackageJson,
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
