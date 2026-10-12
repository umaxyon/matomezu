// フローチャートの戦略の道具入れと、ひし形から出る線のキャプションの候補（docs/PATTERN-plan.md の 3.7 章）
import { expect, test } from "@playwright/test";
import { openDiagram, select } from "./helpers";
import type { Diagram } from "../web/src/types";

const data: Diagram = {
  world: { childView: "flow" },
  nodes: [
    { id: 2, caption: "分岐", shape: "diamond", x: 60, y: 80 },
    { id: 3, caption: "処理", x: 60, y: 240 },
    { id: 9, caption: "離れた箱", x: 700, y: 40 },
  ],
  edges: [{ id: "e1", from: 2, to: 3 }],
};
const toolbox = (page: import("@playwright/test").Page) => page.locator(".mz-toolbox");

test("フローチャートのページで箱を選ぶと道具入れが出る。道具を押すとその形の影が付く追加モードになり、押した所に足すダイアログが出る", async ({ page }) => {
  await openDiagram(page, data);
  await select(page, 3);
  await expect(toolbox(page)).toBeVisible();

  await toolbox(page).locator('[data-tool="hexagon"]').click();
  await expect(page.locator("#mode-label")).toHaveText("追加モード");
  await expect(toolbox(page)).toBeHidden();
  // フローチャートの中の空いた所（子の 2 と 3 の間）に影を運ぶと、影に六角形の絵が付く。押すとその所に足すダイアログ
  const two = (await page.locator('.mz-node[data-id="2"]').boundingBox())!;
  const three = (await page.locator('.mz-node[data-id="3"]').boundingBox())!;
  const at = { x: two.x + 20, y: (two.y + two.height + three.y) / 2 };
  await page.mouse.move(at.x, at.y, { steps: 5 });
  await expect(page.locator(".mz-add-ghost .mz-add-ghost-icon")).toHaveCount(1);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.mz-dlg [name="shape"]:checked')).toHaveValue("hexagon");
  await page.locator('.mz-dlg [name="caption"]').fill("準備");
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator("#mode-label")).toHaveText("選択モード");
  const hex = page.locator(".mz-node", { hasText: "準備" });
  await expect(hex.locator(":scope > .mz-head")).toHaveClass(/mz-shape-hexagon/);
  const b = (await hex.boundingBox())!;
  expect(Math.abs(b.x - (at.x - 16))).toBeLessThan(40);
});

test("道具入れの道具をキーボードで押すと、置く所を指さずにすぐダイアログを開き、フローチャートの中に足す", async ({ page }) => {
  await openDiagram(page, data);
  await select(page, 3);
  await toolbox(page).locator('[data-tool="circle"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('.mz-dlg [name="shape"]:checked')).toHaveValue("circle");
  await page.locator('.mz-dlg [name="caption"]').fill("接続");
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-node .mz-head", { hasText: "接続" })).toHaveClass(/mz-shape-circle/);
});

test("フローチャートのひし形から出る線の編集ダイアログには Yes / No の候補が出て、押すとキャプションに入る", async ({ page }) => {
  await openDiagram(page, data);
  await page.locator('.mz-edge[data-id="e1"] .mz-hit').dblclick({ force: true });
  await page.locator(".mz-dlg [data-hint=\"No\"]").click();
  await expect(page.locator('.mz-dlg [name="caption"]')).toHaveValue("No");
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator('.mz-edge[data-id="e1"] .mz-label')).toHaveText("No");
});

test("フローチャートのページでは、図の左上に道具入れが出る。足すダイアログで向きの違う形（台形の向き）を絵で選べる", async ({ page }) => {
  await openDiagram(page, { world: { childView: "flow" }, nodes: [{ id: 1, caption: "A", x: 200, y: 200 }] });
  await page.locator(".mz-world").click({ position: { x: 5, y: 5 } });
  await expect(toolbox(page)).toBeVisible();
  const stage = (await page.locator("#stage").boundingBox())!;
  const box = (await toolbox(page).boundingBox())!;
  expect(box.x - stage.x).toBeLessThan(20);
  expect(box.y - stage.y).toBeLessThan(20);

  await toolbox(page).locator('[data-tool="trapezoid"]').click();
  await page.mouse.click(stage.x + 500, stage.y + 400); // 置きたい所を押す
  // 向きの違う形も、それぞれ 1 つの絵として並ぶ（shape-picker.ts）
  await expect(page.locator('.mz-dlg [name="shape"]:checked')).toHaveValue("trapezoid");
  await page.locator('.mz-dlg label:has(input[name="shape"][value="trapezoidAlt"])').click();
  await page.locator('.mz-dlg [name="caption"]').fill("手作業");
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-node .mz-head", { hasText: "手作業" })).toHaveClass(/mz-shape-trapezoidAlt/);
  // サイドバーでも、その絵を選んでいる
  await expect(page.locator('#sidebar input[name="mzp-shape"][value="trapezoidAlt"]')).toBeChecked();
});

test("箱を動かしたあとで自動で整列を押すと、箱だけでなく線も、整列したときの形に引き直す", async ({ page }) => {
  // 位置を書かないので、開いたときに整列して置かれる
  await openDiagram(page, {
    world: { childView: "flow" },
    nodes: [
      { id: 1, caption: "開始", shape: "stadium" }, { id: 2, caption: "分岐", shape: "diamond" },
      { id: 3, caption: "はい" }, { id: 4, caption: "いいえ" },
    ],
    edges: [{ id: "e1", from: 1, to: 2 }, { id: "e2", from: 2, to: 3 }, { id: "e3", from: 2, to: 4 }, { id: "e4", from: 4, to: 3 }],
  });
  // 線ごとの点の並び（線の重なりの順は、触った線が手前に来るので変わる。id で並べる）
  const points = () => page.locator(".mz-edge").evaluateAll(gs =>
    Object.fromEntries(gs.map(g => [(g as HTMLElement).dataset.id, g.querySelector(".mz-line")?.getAttribute("points")])));
  const aligned = await points();
  for (const [id, dx, dy] of [[4, -400, 120], [3, 300, 0]] as const) {
    const h = (await page.locator(`.mz-node[data-id="${id}"] > .mz-head`).boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + dx, h.y + h.height / 2 + dy, { steps: 20 });
    await page.mouse.up();
  }
  expect(await points()).not.toEqual(aligned);
  await page.locator(".mz-world").click({ position: { x: 5, y: 5 } });
  await page.locator("[data-auto-align]").click();
  await expect.poll(points).toEqual(aligned);
});
