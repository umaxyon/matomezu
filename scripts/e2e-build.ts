// e2e の前に 1 度だけ作る物: 本番向けにビルドした画面（e2e/.dist）と、テストの用意の口を入れた常駐の実行ファイル（ビルドタグ e2e。e2e/.matomezu）と、
// 字の幅を確かめる e2e が比べる core の幅の表（e2e/text-widths.ts の TEXT_WIDTHS_FILE）。
// bun scripts/e2e-build.ts（e2e/global-setup.ts が呼ぶ）
import { rmSync, writeFileSync } from "node:fs"
import { BODY_FONT, bodyPieces, TEXT_WIDTHS_FILE } from "../e2e/text-widths"
import { textWidth } from "../web/src/plugins/base/text/text"

const run = async (cmd: string[]) => {
  const code = await Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" }).exited
  if (code !== 0) process.exit(code)
}

rmSync("e2e/.dist", { recursive: true, force: true })
await run(["bun", "build", "web/index.html", "--outdir", "e2e/.dist", "--production"])
await run(["bun", "scripts/fonts.ts", "copy", "e2e/.dist/fonts"])
await run(["go", "build", "-tags", "e2e", "-o", "e2e/.matomezu", "./cmd/matomezu"])
writeFileSync(TEXT_WIDTHS_FILE, JSON.stringify(Object.fromEntries(bodyPieces().map(t => [t, textWidth(t, BODY_FONT)]))))
