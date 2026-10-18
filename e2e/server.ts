// ワーカー（並列で流す 1 本）ごとの matomezu のサーバー（F29: e2e はサーバーを通す。2026-10-18 ユーザー）。
// 自分の状態のフォルダ（MATOMEZU_HOME）を持ち、サーバーは空いたポートで起動する。画面表示用のサーバー（ユーザーが見ている 41009）や、
// ほかのワーカーのサーバーとはぶつからない。最初に使ったときに作り、ワーカーが終わるときに止めて消す
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface WorkerServer {
  dir: string; // 状態のフォルダ兼、図のファイルを置くフォルダ
  run(...args: string[]): string; // matomezu のコマンド（誤りなら例外。stderr は例外の stderr）
  write(name: string, data: unknown): string; // 図のファイルを書いてパスを返す
}

let server: WorkerServer | null = null;

export function workerServer(): WorkerServer {
  if (server) return server;
  const bin = process.env.MATOMEZU_E2E_BIN;
  if (!bin) throw new Error("MATOMEZU_E2E_BIN is not set (e2e/global-setup.ts builds the binary)");
  const dir = mkdtempSync(join(tmpdir(), "matomezu-e2e-"));
  const run = (...args: string[]) =>
    execFileSync(bin, args, { cwd: dir, env: { ...process.env, MATOMEZU_HOME: dir }, encoding: "utf8", timeout: 20_000 });
  const write = (name: string, data: unknown) => {
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify(data));
    return file;
  };
  process.on("exit", () => {
    try { run("stop"); } catch { /* 止まっていてもよい */ }
    rmSync(dir, { recursive: true, force: true });
  });
  server = { dir, run, write };
  return server;
}
