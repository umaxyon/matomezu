import { expect, test } from "bun:test"
import { resolve } from "node:path"

// 見本のアプリは、型の表に書き足すので、アプリごとに別の TypeScript のプロジェクトにしてある（書き足しが本体や、ほかのアプリに漏れないように）
for (const app of ["hoge-app", "fuga-app"]) {
  test(`見本のアプリ（test/examples/${app}）は型の検査を通る`, () => {
    const root = resolve(import.meta.dir, "..")
    const run = Bun.spawnSync(["bunx", "tsc", "--noEmit", "-p", `test/examples/${app}`], { cwd: root })
    expect(run.stdout.toString() + run.stderr.toString()).toBe("")
    expect(run.exitCode).toBe(0)
  }, 60_000)
}
