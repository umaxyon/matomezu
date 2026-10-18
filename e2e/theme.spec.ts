// テーマ（docs/THEME-plan.md 11 章）を実際のブラウザで確かめる。テーマは見た目だけで、大きさに入らない（D44）
import { expect, test } from "@playwright/test";
import { openDiagram, rect, violations, confirmDialog } from "./helpers";

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test("付箋紙にしても文字の箱の大きさは変わらない（テーマは見た目だけで余白を持たない。D44）。右上に折り目が付き、標準に戻すと消える", { tag: "@d44" }, async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "テーマの余白を確かめる", x: 40, y: 40 }] });
  const before = await rect(page, 1);
  // ブックのダイアログのページのタブで、テーマを付箋紙にする
  const pageTheme = async (value: string) => {
    await page.locator("#book").click();
    await page.selectOption('.mz-dlg [data-tab-pane]:not([hidden]) select[name="theme"]', value);
    await confirmDialog(page);
  };
  const head = page.locator('.mz-node[data-id="1"] > .mz-head');
  await pageTheme("sticky");
  expect(await rect(page, 1)).toEqual(before);
  expect(await head.evaluate(h => getComputedStyle(h).paddingLeft)).toBe("8px");
  await expect(head).toHaveClass(/mz-style-sticky/);
  await pageTheme("default");
  expect(await rect(page, 1)).toEqual(before);
  await expect(head).not.toHaveClass(/mz-style-sticky/);
});

test("DB とひし形は、形の外の四角い範囲に色が付かない（背景が透ける）。影はひし形の図形にだけかけ、DB には付けない", async ({ page }) => {
  await openDiagram(page, {
    world: { theme: "sticky", background: "#f8fafc" },
    nodes: [
      { id: 1, caption: "DB", shape: "db", color: "danger", x: 40, y: 40 },
      { id: 2, caption: "分岐", shape: "diamond", x: 300, y: 40 },
    ],
  });
  for (const id of [1, 2]) {
    const b = (await page.locator(`.mz-node[data-id="${id}"] > .mz-head`).boundingBox())!;
    const shot = await page.screenshot({ clip: { x: b.x - 10, y: b.y - 10, width: b.width + 20, height: b.height + 20 } });
    const px = await page.evaluate(async ([src, w, h]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0);
      const at = (u: number, v: number) => Array.from(x.getImageData(Math.round(u * img.width / w), Math.round(v * img.height / h), 1, 1).data.slice(0, 3));
      // 外（範囲の外）、形の外の角（範囲の内側。左上の角から 3px）
      return { out: at(2, 2), corner: at(13, 13) };
    }, [shot.toString("base64"), b.width + 20, b.height + 20] as const);
    // 影のぼかしが届く分の 1 段階は許す（以前は範囲全体が 3 段階暗かった）
    expect(Math.max(...px.corner.map((v, i) => Math.abs(v - px.out[i]!)))).toBeLessThanOrEqual(1);
    // 影は SVG の中のフィルターで、本体の図形にだけかける。DB には付けない
    const filter = await page.locator(`.mz-node[data-id="${id}"] .mz-shape > :first-child`).getAttribute("filter");
    if (id === 1) expect(filter).toBeNull();
    else expect(filter).toMatch(/^url\(#mz-shadow-/);
  }
});
