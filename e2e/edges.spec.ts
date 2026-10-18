// 線の中棒のドラッグと、端のつなぎ替え（本物のポインタの位置で判定する所）
import { expect, test } from "@playwright/test";
import { openDiagram, confirmDialog } from "./helpers";

test("Z 字の中棒をドラッグで動かせ、線を選ぶと自動に戻せる", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 400, y: 120 }],
    edges: [{ id: "e1", from: 1, to: 2, route: "elbow" }],
  });
  const edge = page.locator('.mz-edge[data-id="e1"]');
  const midX = () => edge.locator(".mz-hit").evaluate(l => Number((l.getAttribute("points") ?? "").trim().split(/\s+/)[1]!.split(",")[0]));
  const before = await midX();
  const bar = await edge.locator(".mz-bend").evaluate(l => {
    const g = l as SVGLineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const n = (k: string) => Number(g.getAttribute(k));
    return { x: svg.left + n("x1"), y: svg.top + (n("y1") + n("y2")) / 2 };
  });
  expect(await edge.locator(".mz-bend").evaluate(l => getComputedStyle(l).cursor)).toBe("col-resize");
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(bar.x + 60, bar.y, { steps: 5 });
  await page.mouse.up();
  expect(await midX()).toBeCloseTo(before + 60, 0);

  // 線の編集ダイアログに「折れ線を自動に戻す」が出て、押して確定すると戻る
  await page.mouse.dblclick(bar.x + 60, bar.y);
  const reset = page.locator('.mz-dlg [data-once="via"]');
  await expect(reset).toBeVisible();
  await reset.click();
  await confirmDialog(page);
  await expect.poll(midX).toBeCloseTo(before, 0);
  await page.mouse.dblclick(bar.x, bar.y);
  await expect(page.locator(".mz-dlg h2")).toHaveText("線の編集");
  await expect(reset).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("選んだ線の端をほかの箱まで運ぶと、その箱を強調し、離すとつなぎ替える。付け替えられない箱へは付け替えない（E12）", async ({ page }) => {
  await openDiagram(page, {
    nodes: [
      { id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 340, y: 40 }, { id: 3, caption: "C", x: 340, y: 240 },
      { id: 4, caption: "D", x: 40, y: 240 },
    ],
    edges: [{ id: "e1", from: 1, to: 2, caption: "使う" }, { id: "e2", from: 1, to: 4 }],
  });
  const edge = page.locator('.mz-edge[data-id="e1"]');
  // 線の終点がどの箱の上にあるか（終点の座標を含む箱の id）
  const endOn = () => edge.locator(".mz-hit").evaluate(l => {
    const g = l as SVGPolylineElement, svg = g.ownerSVGElement!.getBoundingClientRect();
    const [x, y] = (g.getAttribute("points") ?? "").trim().split(/\s+/).at(-1)!.split(",").map(Number);
    const px = svg.left + x!, py = svg.top + y!;
    return [...document.querySelectorAll<HTMLElement>(".mz-node[data-id] > .mz-head")].find(h => {
      const r = h.getBoundingClientRect();
      return px >= r.left - 2 && px <= r.right + 2 && py >= r.top - 2 && py <= r.bottom + 2;
    })?.parentElement!.dataset.id;
  });
  const center = async (id: number) => {
    const b = (await page.locator(`.mz-node[data-id="${id}"] > .mz-head`).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const dragEnd = async (to: { x: number; y: number }, check?: () => Promise<void>) => {
    const b = (await edge.locator('.mz-end[data-end="enter"]').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await check?.();
    await page.mouse.up();
  };
  await edge.locator(".mz-label").click();
  await expect(edge).toHaveClass(/mz-selected/);
  // 終点（B）を C へ運ぶ: C が強調され、離すと 1 → 3 になる（キャプションはそのまま）
  await dragEnd(await center(3), async () => {
    await expect(page.locator('.mz-node[data-id="3"]')).toHaveClass(/mz-link-target/);
  });
  await expect.poll(endOn).toBe("3");
  await expect(edge.locator(".mz-label")).toHaveText("使う");
  await expect(page.locator(".mz-link-target")).toHaveCount(0);
  // D へは、1 → 4 の線がもうあるので付け替えない（強調もしない）
  await dragEnd(await center(4), async () => {
    await expect(page.locator(".mz-link-target")).toHaveCount(0);
  });
  await expect.poll(endOn).toBe("3");
  // Undo で元に戻る
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await edge.locator(".mz-label").click();
  await expect.poll(endOn).toBe("2");
});
