// フローチャートの道具入れで影を出して押した所に足す（ほかの流れは e2e/scenario-book.spec.ts のシナリオ 15）
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
  await expect(toolbox(page).locator('[data-tool="hexagon"]')).toHaveAttribute("aria-pressed", "true"); // 道具箱は出たまま、押した形を示す
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
