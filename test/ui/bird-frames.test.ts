// 鳥の絵のコマの切り出し（base/birds/frames.ts）: どのコマも絵の中に収まり、足元と切り抜きの点もコマの四角の中にある
import { expect, test } from "bun:test"
import { SHEETS } from "../../web/src/plugins/base/birds/frames"

test("どの鳥のどのコマも、絵の中に収まる。足元と切り抜きの点はコマの四角の中", () => {
  for (const [bird, sheet] of Object.entries(SHEETS)) {
    expect(sheet.frames.length, bird).toBe(16)
    for (const [x, y, w, h, anchorX, groundY, clip] of sheet.frames) {
      expect(x >= 0 && y >= 0 && x + w <= sheet.size && y + h <= sheet.size, bird).toBe(true)
      expect(anchorX >= 0 && anchorX <= w && groundY >= 0 && groundY <= h, bird).toBe(true)
      for (let i = 0; i + 1 < clip.length; i += 2)
        expect((clip[i] ?? 0) <= w + 0.01 && (clip[i + 1] ?? 0) <= h + 0.01, bird).toBe(true)
    }
  }
})
