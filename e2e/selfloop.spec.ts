// 自分に戻る線を実際のブラウザで確かめる（docs/SELFLOOP-plan.md）
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

test("輪を選んで端をつまむと、箱のふちに沿って動き、輪が付いてくる", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "申請中", x: 200, y: 160 }], edges: [{ id: "e1", from: 1, to: 1, arrow: "end" }] });
  // 輪の線の真ん中の点を押して選ぶ
  const [px, py] = await page.locator(".mz-edge .mz-hit").first().evaluate(l => {
    const el = l as SVGPolylineElement, p = el.getPointAtLength(el.getTotalLength() / 2), m = el.getScreenCTM()!;
    return [m.a * p.x + m.e, m.d * p.y + m.f];
  });
  await page.mouse.click(px, py);
  const end = page.locator(".mz-edge .mz-end").first();
  await expect(end).toBeVisible();
  const before = await end.evaluate(c => [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))]);
  const e = (await end.boundingBox())!;
  await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
  await page.mouse.down();
  await page.mouse.move(e.x + e.width / 2 - 60, e.y + e.height / 2 - 10, { steps: 6 }); // 上の辺に沿って左へ
  await page.mouse.up();
  const after = await end.evaluate(c => [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))]);
  expect(after[1]).toBe(before[1]);                 // 上の辺の上のまま
  expect(after[0]!).toBeLessThan(before[0]! - 40);    // 左へ動いた
  // 線の始点が付いてくる（線の点は小数 1 桁に丸めて描く）
  const first = await page.locator(".mz-edge .mz-hit").first().evaluate(l => l.getAttribute("points")!.split(" ")[0]!.split(",").map(Number));
  expect(Math.abs(first[0]! - after[0]!)).toBeLessThan(0.1);
  expect(Math.abs(first[1]! - after[1]!)).toBeLessThan(0.1);
});
