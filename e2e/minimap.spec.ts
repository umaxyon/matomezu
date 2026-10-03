// ミニマップ（minimap.ts）: ツールバーのボタンで開閉する、図の右上の全体像。見えている範囲の四角をドラッグすると、図の枠がスクロールする
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

// 縦に長い図（画面の 3 倍ほど）。線も 1 本
const tall = {
  nodes: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, caption: `箱 ${i + 1}`, x: 40 + (i % 2) * 300, y: 40 + i * 160 })),
  edges: [{ from: 1, to: 12 }],
};

test("ミニマップは最初は閉じていて図の上に何も無い。ボタンで開くと全体と見えている範囲が出る。四角をドラッグすると図がスクロールし、外を押すとそこへ飛ぶ", async ({ page }) => {
  await openDiagram(page, tall);
  const toggle = page.locator("#minimap-toggle");
  const map = page.locator(".mz-minimap");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(map).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const view = map.locator(".mm-view");
  await expect(view).toBeVisible();
  await expect(map.locator(".mm-box")).toHaveCount(12);
  await expect(map.locator(".mm-edge")).toHaveCount(1);
  // 見えている範囲の四角は、図の端に重なる辺も枠の内側に収まる（右の線が切れない）
  const [svgBox, viewBox] = [(await map.locator("svg").boundingBox())!, (await view.boundingBox())!];
  expect(viewBox.x + viewBox.width).toBeLessThanOrEqual(svgBox.x + svgBox.width + 0.01);

  const stage = page.locator("#stage");
  const top = () => stage.evaluate(s => s.scrollTop);
  expect(await top()).toBe(0);
  // 四角を下へ 40px ドラッグ（ミニマップの倍率で割った分だけスクロールする）
  const v = (await view.boundingBox())!;
  await page.mouse.move(v.x + v.width / 2, v.y + 5);
  await page.mouse.down();
  await page.mouse.move(v.x + v.width / 2, v.y + 45, { steps: 5 });
  await page.mouse.up();
  const scale = await map.locator("svg").evaluate(s => (s as SVGSVGElement).width.baseVal.value / document.getElementById("stage")!.scrollWidth);
  expect(Math.abs(await top() - 40 / scale)).toBeLessThan(4);
  // 一番上を押すと、そこが真ん中に来るように飛ぶ（上端なので 0）
  const svg = (await map.locator("svg").boundingBox())!;
  await page.mouse.click(svg.x + 10, svg.y + 1);
  await expect.poll(top).toBe(0);
  // 閉じると図の上から消える
  await page.locator("#minimap-toggle").click();
  await expect(page.locator(".mz-minimap")).toBeHidden();
});

test("図が画面に収まっていればボタンは押せない。開いたあとスクロールが無くなると、ボタンはオフに戻る", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "A" }] });
  const toggle = page.locator("#minimap-toggle");
  await expect(toggle).toBeDisabled();
  // 下の方に置いた箱があればスクロールするので開ける
  await openDiagram(page, { nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 40, y: 1400 }] });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(page.locator(".mz-minimap")).toBeVisible();
  // 収まる図に変わると（箱を動かしてスクロールが無くなったのと同じ）、オフに戻って押せなくなる
  await openDiagram(page, { nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 40, y: 200 }] });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toBeDisabled();
  await expect(page.locator(".mz-minimap")).toBeHidden();
});

test("全体像がミニマップの高さを超えても、右端は切れず、見えている範囲の四角はミニマップの中に見える", async ({ page }) => {
  await openDiagram(page, {
    nodes: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, caption: `箱 ${i + 1}`, x: 40 + (i % 2) * 300, y: 40 + i * 160 })),
  });
  await page.locator("#minimap-toggle").click();
  const map = page.locator(".mz-minimap");
  const body = map.locator(".mz-minimap-body");
  await expect(map.locator(".mm-view")).toBeVisible(); // 描くのは次の描画の前なので、描き終わるのを待つ
  await expect.poll(() => body.evaluate(b => b.scrollHeight > b.clientHeight)).toBe(true); // 中でスクロールしている
  // スクロールバーで狭くならず、全体像の幅は中に使える幅とちょうど同じ
  expect(await body.evaluate(b => b.clientWidth)).toBe(158); // 160 から枠線の 2px を除いた幅
  expect(await map.locator("svg").evaluate(s => (s as SVGSVGElement).width.baseVal.value)).toBe(158);
  // 図を一番下までスクロールすると、ミニマップも追って四角が見える
  await page.locator("#stage").evaluate(s => { s.scrollTop = s.scrollHeight; });
  const view = map.locator(".mm-view");
  await expect.poll(async () => {
    const [b, v] = [(await body.boundingBox())!, (await view.boundingBox())!];
    return v.y >= b.y - 1 && v.y + v.height <= b.y + b.height + 1 && v.x + v.width <= b.x + b.width + 0.01;
  }).toBe(true);
});
