// 開発用: 画面を変更のたびにビルドし直し、web/dist を Go の常駐（matomezu serve）で配る。bun scripts/dev.ts [--port <ポート>] [serve に渡す引数]
// ポートを付けなければ、.dev-home が覚えたポート（選んだことが無ければ 5300）。付けたポートは .dev-home が覚える。
// 開いたブラウザは画面 cookie を持つ必要がある（cookie が無い画面は「画面 cookie が要る」と出る）。リポジトリの中で .dev-home/matomezu open を打つと、画面 cookie を渡す URL でブラウザが開く。
// 追加プラグインを結ぶなら bun run dev --plugin <開発者プロジェクトのフォルダ>（変えたら起動し直すか、POST /api/plugins で入れ替える）。
// 常駐の matomezu 保管庫フォルダは .dev-home（利用者が使っている matomezu 保管庫フォルダに触らない）。Go のコードを変えたら起動し直す
import { webBuild } from "./web-build"

const args = process.argv.slice(2)
const build = webBuild("web/dist", "development")
const exe = ".dev-home/matomezu"

const built = await Bun.spawn(["go", "build", "-o", exe, "./cmd/matomezu"], { stdout: "inherit", stderr: "inherit" })
  .exited
if (built !== 0) process.exit(built)
await Bun.spawn(build, { stdout: "inherit", stderr: "inherit" }).exited
const fonts = await Bun.spawn(["bun", "scripts/fonts.ts", "copy", "web/dist/fonts"], {
  stdout: "inherit",
  stderr: "inherit",
}).exited
if (fonts !== 0) process.exit(fonts)
const watch = Bun.spawn([...build, "--watch", "--no-clear-screen"], { stdout: "inherit", stderr: "inherit" })
const serve = Bun.spawn([exe, "serve", "--web", "web/dist", ...args], {
  env: { ...process.env, MATOMEZU_HOME: ".dev-home" },
  stdout: "inherit",
  stderr: "inherit",
})

// どちらかが止まったら、もう片方も止めて終わる
const code = await Promise.race([watch.exited, serve.exited])
watch.kill()
serve.kill()
process.exit(code)
