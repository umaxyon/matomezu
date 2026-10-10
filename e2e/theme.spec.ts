// テーマ（docs/THEME-plan.md 11 章）を実際のブラウザで確かめる。箱の中の余白は文字を測るときに含まれる
import { expect, test } from "@playwright/test";
import { openDiagram, rect, violations } from "./helpers";

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test("付箋紙にすると余白の分だけ文字の箱が大きくなり、標準に戻すと元の大きさに戻る", async ({ page }) => {
  // 幅が最小（120）と最大（240）のあいだに収まる長さの文字にする（張り付くと余白の差が出ない）
  await openDiagram(page, { nodes: [{ id: 1, caption: "テーマの余白を確かめる", x: 40, y: 40 }] });
  const before = await rect(page, 1);
  // ワールドを選んで、テーマを付箋紙にする
  await page.locator(".mz-world").click({ position: { x: 600, y: 400 } });
  await page.selectOption('select[name="mzp-theme"]', "sticky");
  const sticky = await rect(page, 1);
  expect(sticky.h).toBeGreaterThan(before.h - 1); // 高さは最小の 64 のこともある
  expect(sticky.w).toBeGreaterThan(before.w);
  const pad = await page.locator('.mz-node[data-id="1"] > .mz-head').evaluate(h => getComputedStyle(h).paddingLeft);
  expect(pad).toBe("12px");
  await page.selectOption('select[name="mzp-theme"]', "default");
  expect(await rect(page, 1)).toEqual(before);
});

test("影のある形（DB・ひし形）は、形の外の四角い範囲に色が付かない（背景が透ける）。影は図形にだけかける", async ({ page }) => {
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
    // 影は SVG の中のフィルターで、本体の図形にだけかける
    expect(await page.locator(`.mz-node[data-id="${id}"] .mz-shape > :first-child`).getAttribute("filter")).toMatch(/^url\(#mz-shadow-/);
  }
});
