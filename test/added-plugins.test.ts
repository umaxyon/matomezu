import { expect, test } from "bun:test"
import { resolve } from "node:path"

// 追加プラグインの見本は、core/catalog.ts に書き足すので、見本ごとに別の TypeScript のプロジェクトにしてある（書き足しが matomezu 本体や、ほかの見本に漏れないように）
for (const example of ["ex1", "ex2", "ex3"]) {
  test(`見本（test/added-plugins/${example}）は型の検査を通る`, () => {
    const root = resolve(import.meta.dir, "..")
    const run = Bun.spawnSync(["bunx", "tsc", "--noEmit", "-p", `test/added-plugins/${example}`], { cwd: root })
    expect(run.stdout.toString() + run.stderr.toString()).toBe("")
    expect(run.exitCode).toBe(0)
  }, 60_000)
}
