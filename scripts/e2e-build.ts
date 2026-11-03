// e2e の前に 1 度だけ作る物: 本番向けにビルドした画面（e2e/.dist）と、テストの用意の口を入れた常駐の実行ファイル（ビルドタグ e2e。e2e/.matomezu）。
// bun scripts/e2e-build.ts（e2e/global-setup.ts が呼ぶ）
import { rmSync } from "node:fs"

const run = async (cmd: string[]) => {
  const code = await Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" }).exited
  if (code !== 0) process.exit(code)
}

rmSync("e2e/.dist", { recursive: true, force: true })
await run(["bun", "build", "web/index.html", "--outdir", "e2e/.dist", "--production"])
await run(["bun", "scripts/fonts.ts", "copy", "e2e/.dist/fonts"])
await run(["go", "build", "-tags", "e2e", "-o", "e2e/.matomezu", "./cmd/matomezu"])
