// e2e を流す前に一度だけ: 画面をビルドし、実行ファイルを作る（F29: e2e はサーバーを通す。2026-10-18 ユーザー）。
// 実行ファイルの場所は MATOMEZU_E2E_BIN で、ワーカー（e2e/server.ts）に渡す
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export default function globalSetup() {
  // 作ってある実行ファイルを渡されたら作らない（並べて e2e を流すとき、ビルドがぶつからないように。画面のビルドもしてある前提）
  if (process.env.MATOMEZU_E2E_BIN && existsSync(process.env.MATOMEZU_E2E_BIN)) return;
  const repo = resolve(import.meta.dirname, "..");
  execFileSync("bun", ["run", "build"], { cwd: repo, stdio: "ignore", timeout: 120_000 });
  const dir = join(tmpdir(), `matomezu-e2e-bin-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const bin = join(dir, "matomezu");
  execFileSync("go", ["build", "-o", bin, "./cmd/matomezu"], { cwd: repo, timeout: 180_000 });
  process.env.MATOMEZU_E2E_BIN = bin;
}
