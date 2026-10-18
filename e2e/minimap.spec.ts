// ミニマップ（minimap.ts）: ツールバーのボタンで開閉する、図の右上の全体像。見えている範囲の四角をドラッグすると、図の枠がスクロールする
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

// 縦に長い図（画面の 2 倍ほど。紙の外に書くと、開いたときに紙の中へ押し込まれるので A3 縦の紙の中に。docs/PAPER-plan.md の 4.6 の 7）。線も 1 本
const tall = {
  world: { paper: "a3-portrait" },
  nodes: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, caption: `箱 ${i + 1}`, x: 40 + (i % 2) * 300, y: 40 + i * 120 })),
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
  const [svgBox, viewBox] = [(await map.locator(".mz-minimap-body > svg").boundingBox())!, (await view.boundingBox())!];
  expect(viewBox.x + viewBox.width).toBeLessThanOrEqual(svgBox.x + svgBox.width + 0.01);

  const stage = page.locator(".stage:visible");
  const top = () => stage.evaluate(s => s.scrollTop);
  const top0 = await top(); // 開いたときは、ワールドの左上から見せる（周りの余白の分だけスクロールしている。D32）
  expect(top0).toBeGreaterThan(0);
  // 四角を下へ 40px ドラッグ（ミニマップの倍率で割った分だけスクロールする）
  const v = (await view.boundingBox())!;
  await page.mouse.move(v.x + v.width / 2, v.y + 5);
  await page.mouse.down();
  await page.mouse.move(v.x + v.width / 2, v.y + 45, { steps: 5 });
  await page.mouse.up();
  const scale = await map.locator(".mz-minimap-body > svg").evaluate(s => (s as SVGSVGElement).width.baseVal.value / document.querySelector<HTMLElement>(".stage:not([hidden])")!.scrollWidth);
  expect(Math.abs(await top() - top0 - 40 / scale)).toBeLessThan(4);
  // 一番上を押すと、そこが真ん中に来るように飛ぶ（上端なので 0）
  const svg = (await map.locator(".mz-minimap-body > svg").boundingBox())!;
  await page.mouse.click(svg.x + 10, svg.y + 1);
  await expect.poll(top).toBe(0);
  // 閉じると図の上から消える
  await page.locator("#minimap-toggle").click();
  await expect(page.locator(".mz-minimap")).toBeHidden();
});

test("図が画面に収まっていればボタンは押せない。開いたあとスクロールが無くなると、ボタンはオフに戻る", async ({ page }) => {
  // 紙（D33）が画面に収まるか（A5 横は収まる、A3 縦は縦に収まらない）
  await openDiagram(page, { world: { paper: "a5-landscape" }, nodes: [{ id: 1, caption: "A" }] } as never);
  const toggle = page.locator("#minimap-toggle");
  await expect(toggle).toBeDisabled();
  // 紙が画面より大きければスクロールするので開ける
  const file = await openDiagram(page, { world: { paper: "a3-portrait" }, nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 40, y: 1400 }] } as never);
  await expect(toggle).toBeEnabled();
  await toggle.click();
  const map = page.locator(".mz-minimap:visible"); // ブックごとにあり、裏のブックのものは見えない
  await expect(map).toHaveCount(1);
  // 収まる図に変わると（箱を動かしてスクロールが無くなったのと同じ）、オフに戻って押せなくなる。外の変更として読み直す
  writeFileSync(file, JSON.stringify({ world: { paper: "a5-landscape" }, nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 40, y: 200 }] }));
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toBeDisabled();
  await expect(map).toHaveCount(0);
});

test("全体像がミニマップの高さを超えても、右端は切れず、見えている範囲の四角はミニマップの中に見える", async ({ page }) => {
  // 紙（A3 縦）に収まる縦に長い図（紙に収まらない図は開かない。docs/PAPER-plan.md の 4.6 の 7）。
  // 紙の全体像は 158px 幅で高さ 230px ほどなので、低い窓にしてミニマップの高さの上限（窓の半分）を超えさせる
  await page.setViewportSize({ width: 1280, height: 400 });
  await openDiagram(page, {
    world: { paper: "a3-portrait" },
    nodes: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, caption: `箱 ${i + 1}`, x: 40 + (i % 2) * 300, y: 40 + i * 72 })),
  } as never);
  await page.locator("#minimap-toggle").click();
  const map = page.locator(".mz-minimap");
  const body = map.locator(".mz-minimap-body");
  await expect(map.locator(".mm-view")).toBeVisible(); // 描くのは次の描画の前なので、描き終わるのを待つ
  await expect.poll(() => body.evaluate(b => b.scrollHeight > b.clientHeight)).toBe(true); // 中でスクロールしている
  // スクロールバーで狭くならず、全体像の幅は中に使える幅とちょうど同じ
  expect(await body.evaluate(b => b.clientWidth)).toBe(158); // 160 から枠線の 2px を除いた幅
  expect(await map.locator(".mz-minimap-body > svg").evaluate(s => (s as SVGSVGElement).width.baseVal.value)).toBe(158);
  // 図を一番下までスクロールすると、ミニマップも追って四角が見える
  await page.locator(".stage:visible").evaluate(s => { s.scrollTop = s.scrollHeight; });
  const view = map.locator(".mm-view");
  await expect.poll(async () => {
    // ミニマップは描き直すたびに中身を作り直す（replaceChildren）ので、入れ替わる瞬間は測れない。測れなければ待ち直す
    const [b, v] = [await body.boundingBox(), await view.boundingBox()];
    if (!b || !v) return false;
    return v.y >= b.y - 1 && v.y + v.height <= b.y + b.height + 1 && v.x + v.width <= b.x + b.width + 0.01;
  }).toBe(true);
});

test("ミニマップの背景は、テーマの背景（付箋紙・シンプル）も塗る。world.background があればそちら（リンクの箱の窓と同じ）", async ({ page }) => {
  await openDiagram(page, { ...tall, world: { theme: "sticky" } });
  await page.locator("#minimap-toggle").click();
  const bg = page.locator(".mz-minimap .mm-bg");
  await expect(bg).toHaveCount(1);
  expect(await bg.evaluate(r => (r as SVGElement).style.fill)).toBe("rgb(244, 239, 228)"); // theme.ts の sticky の background（#f4efe4）
  await openDiagram(page, { ...tall, world: { theme: "sticky", background: "#1e1e1e" } });
  await page.locator("#minimap-toggle").click();
  expect(await page.locator(".mz-minimap .mm-bg").evaluate(r => (r as SVGElement).style.fill)).toBe("rgb(30, 30, 30)");
});
