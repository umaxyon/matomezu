// 同梱のフォント（D44 の 4.2。web/fonts の Noto Sans JP）: どの画面でも同じフォントで描いて測る
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

test("箱の文字は同梱のフォントで描き、読み込みが済んでから並べる。サロゲートペアの漢字（𠮷）も同梱のフォントにある", { tag: "@d44" }, async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "𠮷野家の箱", x: 40, y: 40 }] });
  const head = page.locator('.mz-node[data-id="1"] > .mz-head');
  expect(await head.evaluate(h => getComputedStyle(h).fontFamily)).toMatch(/^"matomezu Noto Sans JP"/);
  expect(await page.evaluate(() => document.fonts.check('600 14px "matomezu Noto Sans JP"', "𠮷"))).toBe(true);
  expect(await page.evaluate(() => [...document.fonts].some(f => f.family.replaceAll('"', "") === "matomezu Noto Sans JP" && f.status === "loaded"))).toBe(true);
});
