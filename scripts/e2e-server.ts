// 実際のブラウザのテスト用の常駐: 画面のビルドを配るサーバー（wait の URL）が答えるまで待ち、空のアプリのフォルダで matomezu serve を立てる。
// bun scripts/e2e-server.ts <ポート> <画面のフォルダ> <待つ URL>
import { rmSync } from "node:fs"

const [port, web, wait] = process.argv.slice(2) as [string, string, string]
const home = "e2e/.home"
const exe = "e2e/.matomezu"

const built = await Bun.spawn(["go", "build", "-o", exe, "./cmd/matomezu"], { stdout: "inherit", stderr: "inherit" })
  .exited
if (built !== 0) process.exit(built)
// 画面のビルドは、配るサーバーが答えた時点で出来上がっている
for (;;) {
  if (await fetch(wait).then(r => r.ok, () => false)) break
  await Bun.sleep(200)
}
rmSync(home, { recursive: true, force: true })
const serve = Bun.spawn([exe, "serve", "--addr", `127.0.0.1:${port}`, "--web", web], {
  env: { ...process.env, MATOMEZU_HOME: home },
  stdout: "inherit",
  stderr: "inherit",
})
process.on("SIGTERM", () => serve.kill())
process.on("SIGINT", () => serve.kill())
process.exit(await serve.exited)
