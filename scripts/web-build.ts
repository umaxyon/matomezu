// 画面のビルドのコマンド: 画面（web/index.html）と、base が画面とは別の処理の流れで使う Web Worker の入口を、out に組む。
// Worker の出力は入口の名前のまま（markdown-parse-worker.js。base の use-markdown-document.tsx が名前で引く）。
// package.json の build・scripts/dev.ts・e2e（scripts/e2e-build.ts と速さを測る playwright の設定）が使う。bun scripts/web-build.ts <out> [--production] でも組める
export const WEB_ENTRIES = ["web/index.html", "web/src/plugins/base/markdown/markdown-parse-worker.ts"]

export const webBuild = (out: string, mode: "production" | "development") => [
  "bun",
  "build",
  ...WEB_ENTRIES,
  "--outdir",
  out,
  "--entry-naming",
  "[name].[ext]",
  ...(mode === "production" ? ["--production"] : []),
]

if (import.meta.main) {
  const [out, flag] = process.argv.slice(2)
  if (!out) throw new Error("usage: bun scripts/web-build.ts <out> [--production]")
  const built = await Bun.spawn(webBuild(out, flag === "--production" ? "production" : "development"), {
    stdout: "inherit",
    stderr: "inherit",
  }).exited
  process.exit(built)
}
