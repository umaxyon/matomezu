// リンクの箱の見せ方の「縮図を出さない」（linkLook の icon。D29）: 縮図の代わりに押すと開くアイコン。キャプションが要る
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

const book = (look?: string) => ({
  pages: [{ id: "p2", title: "処理の流れ" }],
  nodes: [{ id: 1, caption: "流れへ", link: "p2", x: 40, y: 40, ...(look ? { linkLook: look } : {}) }, { id: 2, caption: "中", page: "p2" }],
  edges: [],
});

test("縮図を出さない見せ方は、縮図の代わりに開くアイコンを出す（押すとそのページを開く）", async ({ page }) => {
  await openDiagram(page, book("icon") as never);
  const head = page.locator('.mz-node[data-id="1"] > .mz-head');
  await expect(head).toHaveClass(/mz-link-icon/);
  await expect(head).toHaveClass(/mz-link-side/);
  await expect(head).not.toHaveClass(/mz-link-book/); // ページリンクの持ち手は縞にしない
  const win = head.locator(".mz-link-win");
  const r = (await win.boundingBox())!;
  expect(Math.round(r.width)).toBe(20);
  await expect(head.locator(".mz-link-art *")).toHaveCount(0);
  await expect(win).toHaveAttribute("title", "押すと「処理の流れ」のページを開きます");
});

test("編集ダイアログで縮図を出さないを選ぶと映す範囲の欄が隠れ、キャプションが空なら確定しない", async ({ page }) => {
  await openDiagram(page, book() as never);
  const head = page.locator('.mz-node[data-id="1"] > .mz-head');
  await head.locator(".mz-link-bar").dblclick();
  const dlg = page.locator(".mz-dlg");
  await expect(dlg.locator("[data-clip]")).toBeVisible();
  await dlg.locator("label", { hasText: "縮図を出さない" }).click();
  await expect(dlg.locator("[data-clip]")).toBeHidden();
  await dlg.locator('[name="caption"]').fill("");
  await dlg.locator("[data-ok]").click();
  await expect(dlg.locator(".mz-dlg-refused")).toContainText("キャプションを入れてください");
  await dlg.locator('[name="caption"]').fill("流れへ");
  await dlg.locator("[data-ok]").click();
  await expect(dlg).toHaveCount(0);
  await expect(head).toHaveClass(/mz-link-icon/);
});
