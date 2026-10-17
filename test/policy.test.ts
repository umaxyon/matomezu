// 方針（policy.ts）の単体のテスト。図全体を作らずに、判断の単位ごとの決まりを確かめる
import { expect, test } from "bun:test";
import { SCENES } from "../web/src/layout/policy";

test("場面の表: 開いたときだけはみ出しを調整し、子のサイズをそろえるときだけ詰め直す。手を離したときは重なった相手が動く。開いたとき・読み直しでは置いた位置を正とする（大きさが変わったときは layout.ts の regrow で、この表は使わない）", () => {
  const rows = Object.entries(SCENES).map(([name, s]) => [name, s.yieldTo, s.repack, s.fitViewport, s.adoptPlaced]);
  expect(rows).toEqual([
    ["open", "later", null, true, true],
    ["reload", "later", null, false, true],
    ["settings", "others", null, false, false],
    ["fitChildren", "others", { w: "down", h: "right" }, false, false],
    ["drop", "others", null, false, false],
  ]);
});
