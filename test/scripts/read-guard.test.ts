import { expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decide, hookOutput, type SizeOf, WHOLE_READ_LIMIT_BYTES } from "../../scripts/read-guard"

const BIG = WHOLE_READ_LIMIT_BYTES + 1
const sizes: Record<string, number> = {
  "/w/big.ts": BIG,
  "/w/small.ts": WHOLE_READ_LIMIT_BYTES,
  "/w/big.md": BIG,
  "/w/sub/big.go": BIG,
}
const sizeOf: SizeOf = p => sizes[p]

test.each([
  ["丸ごと cat する大きなコード", "cat big.ts", true],
  ["cd の行き先から読む", "cd /w/sub && cat big.go", true],
  ["絶対パスで読む", "cat -n /w/big.ts", true],
  ["bat・less も同じ", "less big.ts", true],
  ["線ちょうどまでは通す", "cat small.ts", false],
  ["コードと json でないファイルは通す", "cat big.md", false],
  ["パイプの先があれば通す", "cat big.ts | head -20", false],
  ["書き込みは通す", "cat > big.ts <<'E'\ncat big.ts\nE", false],
  ["範囲を指す読み方は通す", "sed -n '1,80p' big.ts", false],
  ["行き先の分からない cd のあとは通す", "cd $X && cat big.ts", false],
  ["グロブは通す", "cat *.ts", false],
  ["無いファイルは通す", "cat none.ts", false],
  ["引用符が閉じていなければ通す", "cat 'big.ts", false],
])("%s", (_, command, denied) => {
  expect(decide(command, "/w", sizeOf) !== undefined).toBe(denied)
})

test("Bash でない道具と、読めない入力は通す", () => {
  expect(
    hookOutput(JSON.stringify({ tool_name: "Read", tool_input: { command: "cat big.ts" }, cwd: "/w" }), sizeOf),
  ).toBe(undefined)
  expect(hookOutput("{", sizeOf)).toBe(undefined)
})

test("フックとして走らせると、大きなファイルの cat に deny と理由を返す", () => {
  const dir = mkdtempSync(join(tmpdir(), "read-guard-"))
  try {
    writeFileSync(join(dir, "big.ts"), "x".repeat(BIG))
    const run = Bun.spawnSync(["bun", join(import.meta.dir, "../../scripts/read-guard.ts")], {
      stdin: Buffer.from(JSON.stringify({ tool_name: "Bash", tool_input: { command: "cat big.ts" }, cwd: dir })),
    })
    expect(run.exitCode).toBe(0)
    const out = JSON.parse(run.stdout.toString())
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny")
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain("offset と limit")
  } finally {
    rmSync(dir, { recursive: true })
  }
})
