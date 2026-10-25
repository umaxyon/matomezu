// 開発用: 画面を変更のたびにビルドし直し、web/dist を Go の常駐（matomezu serve）で配る。bun scripts/dev.ts <ポート> [serve に渡す引数]
// 追加プラグインを結ぶなら bun run dev --plugin <開発者プロジェクトのフォルダ>（変えたら起動し直す）。
// 常駐のアプリのフォルダは .dev-home（利用者のフォルダに触らない）。Go のコードを変えたら起動し直す
const [port = "5300", ...extra] = process.argv.slice(2)
const build = ["bun", "build", "web/index.html", "--outdir", "web/dist"]
const exe = ".dev-home/matomezu"

const built = await Bun.spawn(["go", "build", "-o", exe, "./cmd/matomezu"], { stdout: "inherit", stderr: "inherit" })
  .exited
if (built !== 0) process.exit(built)
await Bun.spawn(build, { stdout: "inherit", stderr: "inherit" }).exited
await Bun.spawn(["bun", "scripts/fonts.ts", "copy", "web/dist/fonts"], { stdout: "inherit", stderr: "inherit" }).exited
const watch = Bun.spawn([...build, "--watch", "--no-clear-screen"], { stdout: "inherit", stderr: "inherit" })
const serve = Bun.spawn([exe, "serve", "--addr", `127.0.0.1:${port}`, "--web", "web/dist", ...extra], {
  env: { ...process.env, MATOMEZU_HOME: ".dev-home" },
  stdout: "inherit",
  stderr: "inherit",
})

// どちらかが止まったら、もう片方も止めて終わる
const code = await Promise.race([watch.exited, serve.exited])
watch.kill()
serve.kill()
process.exit(code)
