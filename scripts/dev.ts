// 開発用: 画面を変更のたびにビルドし直し、web/dist を配る。bun scripts/dev.ts <ポート>
const port = process.argv[2] ?? "5300";
const build = ["bun", "build", "web/index.html", "--outdir", "web/dist"];

await Bun.spawn(build, { stdout: "inherit", stderr: "inherit" }).exited;
const watch = Bun.spawn([...build, "--watch", "--no-clear-screen"], { stdout: "inherit", stderr: "inherit" });
const serve = Bun.spawn(["bun", "scripts/serve.ts", port], { stdout: "inherit", stderr: "inherit" });

// どちらかが止まったら、もう片方も止めて終わる
const code = await Promise.race([watch.exited, serve.exited]);
watch.kill();
serve.kill();
process.exit(code);
