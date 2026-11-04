// e2e の前に 1 度だけ、画面と常駐の実行ファイルを作る（scripts/e2e-build.ts）
import { execSync } from "node:child_process"

export default function globalSetup() {
  execSync("bun scripts/e2e-build.ts", { stdio: "inherit" })
}
