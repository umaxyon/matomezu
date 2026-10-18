// 方針（policy.ts）の単体のテスト。図全体を作らずに、判断の単位ごとの決まりを確かめる
import { expect, test } from "bun:test";
import { SCENES } from "../web/src/layout/policy";

test("場面の表: 開いたときだけはみ出しを調整し、子のサイズをそろえるときだけ詰め直す。手を離したときは重なった相手が動く。開いたとき・読み直しはデータの大きさから regrow で押す（fromData。D45）。大きさが変わったときの並べ直しは layout.ts の regrow", () => {
  const rows = Object.entries(SCENES).map(([name, s]) => [name, s.yieldTo, s.repack, s.fitViewport, s.adoptPlaced, s.fromData]);
  expect(rows).toEqual([
    ["open", "later", null, true, true, true],
    ["reload", "later", null, false, false, true],
    ["settings", "others", null, false, false, false],
    ["fitChildren", "others", { w: "down", h: "right" }, false, false, false],
    ["drop", "others", null, false, false, false],
  ]);
});
