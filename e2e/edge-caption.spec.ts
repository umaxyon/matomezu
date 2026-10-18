// 線のキャプションを実際のブラウザで確かめる（docs/EDGE-CAPTION-plan.md）
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

test("線の編集ダイアログで通り方・線の種類・矢印を選べ、「線を消す」で線を消す", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 400, y: 40 }],
    edges: [{ id: "e1", from: 1, to: 2, arrow: "end" }],
  });
  const dblclickEdge = async () => {
    const mid = await page.locator('.mz-edge[data-id="e1"] .mz-hit').evaluate(l => {
      const g = l as SVGPolylineElement;
      const svg = g.ownerSVGElement!.getBoundingClientRect();
      const p = g.getPointAtLength(g.getTotalLength() / 2);
      return { x: svg.left + p.x, y: svg.top + p.y };
    });
    await page.mouse.dblclick(mid.x, mid.y);
  };
  await dblclickEdge();
  await expect(page.locator('.mz-dlg [name="head-end"]')).toHaveValue("arrow");
  await expect(page.locator('.mz-dlg [name="head-start"]')).toHaveValue("");
  await expect(page.locator('.mz-dlg [name="route"][value="elbow"]')).toBeChecked(); // 何も書かなければ折れ線
  await expect(page.locator('.mz-dlg [name="dash"][value="solid"]')).toBeChecked();
  await page.locator('.mz-dlg [name="head-start"]').selectOption("arrow");
  await page.locator('.mz-dlg [name="route"][value="straight"]').check();
  await page.locator('.mz-dlg [name="dash"][value="dashed"]').check();
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator('.mz-edge[data-id="e1"] .mz-line')).toHaveClass(/mz-dashed/);
  await expect.poll(() => page.locator('.mz-edge[data-id="e1"] .mz-arrow').getAttribute("d")).toMatch(/Z.*Z$/); // 両端に 1 つずつ
  // 開き直すと、選んだ値が入っている（サイドバーには出さない。2026-10-13 D26）
  await dblclickEdge();
  await expect(page.locator('.mz-dlg [name="head-start"]')).toHaveValue("arrow");
  await expect(page.locator('.mz-dlg [name="head-end"]')).toHaveValue("arrow");
  await expect(page.locator('.mz-dlg [name="route"][value="straight"]')).toBeChecked();
  await expect(page.locator('.mz-dlg [name="dash"][value="dashed"]')).toBeChecked();
  // 塗りの三角でない形（線で描く）と実線に変える
  await page.locator('.mz-dlg [name="head-start"]').selectOption("hollowDiamond");
  await page.locator('.mz-dlg [name="head-end"]').selectOption("open");
  await page.locator('.mz-dlg [name="dash"][value="solid"]').check();
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator('.mz-edge[data-id="e1"] .mz-line')).not.toHaveClass(/mz-dashed/);
  await expect(page.locator('.mz-edge[data-id="e1"] .mz-arrow-line')).not.toHaveAttribute("d", "");
  await expect(page.locator('.mz-edge[data-id="e1"] .mz-arrow')).toHaveAttribute("d", "");
  await dblclickEdge();
  await expect(page.locator('.mz-dlg [name="head-start"]')).toHaveValue("hollowDiamond");
  await expect(page.locator('.mz-dlg [name="head-end"]')).toHaveValue("open");

  await page.locator(".mz-dlg [data-delete]").click();
  await expect(page.locator(".mz-dlg")).toHaveCount(0);
  await expect(page.locator(".mz-edge")).toHaveCount(0);
});
