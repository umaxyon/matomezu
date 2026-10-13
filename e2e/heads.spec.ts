// 線の端の形（docs/HEADS-plan.md）を実際のブラウザで確かめる
import { expect, test } from "@playwright/test";
import { openDiagram, violations } from "./helpers";
import { HEADS } from "../web/src/heads";
import type { Diagram } from "../web/src/types";

const SHOTS = process.env.SHOTS_DIR;

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test("どの種類も描ける（見本）", async ({ page }) => {
  const nodes: Diagram["nodes"] = [], edges: Diagram["edges"] = [];
  HEADS.forEach((h, i) => {
    nodes.push({ id: i * 2 + 1, caption: h, size: "S", x: 40 + (i % 2) * 420, y: 30 + Math.floor(i / 2) * 70 });
    nodes.push({ id: i * 2 + 2, caption: "→", size: "S", x: 300 + (i % 2) * 420, y: 30 + Math.floor(i / 2) * 70 });
    edges.push({ id: `e${i + 1}`, from: i * 2 + 1, to: i * 2 + 2, endHead: h, startHead: h });
  });
  await openDiagram(page, { world: { route: "straight" }, nodes, edges });
  await expect(page.locator(".mz-edge")).toHaveCount(HEADS.length);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/heads.png` });
});

test("線の編集ダイアログで、始点・終点の形を選べる", async ({ page }) => {
  await openDiagram(page, {
    world: { route: "straight" },
    nodes: [{ id: 1, caption: "A", x: 40, y: 60 }, { id: 2, caption: "B", x: 400, y: 60 }],
    edges: [{ id: "e1", from: 1, to: 2, arrow: "end" }],
  });
  const hit = page.locator('.mz-edge[data-id="e1"] .mz-hit');
  await hit.dblclick({ force: true });
  const dlg = page.locator(".mz-dlg-overlay > .mz-dlg");
  await expect(dlg.locator('[name="head-end"]')).toHaveValue("arrow");
  await dlg.locator('[name="head-start"]').selectOption("hollowDiamond");
  await dlg.locator('[name="head-end"]').selectOption("open");
  await dlg.locator("[data-ok]").click();
  await expect(page.locator('.mz-edge[data-id="e1"] .mz-arrow-line')).not.toHaveAttribute("d", "");
  await expect(page.locator('.mz-edge[data-id="e1"] .mz-arrow')).toHaveAttribute("d", "");
  // 開き直すと選んだ形が入っていて、変えられる
  await hit.dblclick({ force: true });
  await expect(dlg.locator('[name="head-start"]')).toHaveValue("hollowDiamond");
  await dlg.locator('[name="head-end"]').selectOption("arrow");
  await dlg.locator('[name="head-start"]').selectOption("");
  await dlg.locator("[data-ok]").click();
  await expect(page.locator('.mz-edge[data-id="e1"] .mz-arrow')).not.toHaveAttribute("d", "");
  await expect(page.locator('.mz-edge[data-id="e1"] .mz-arrow-line')).toHaveAttribute("d", "");
});
