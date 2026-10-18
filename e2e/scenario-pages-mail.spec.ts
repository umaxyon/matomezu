// フォーカスと郵便のページの扱い（2026-10-19 ユーザー）。テストごとに新しいサーバー（e2e/server.ts の testServer）で通す。
// - スクロールのリスト（D33）の見えない行の箱を示すと、リストをその行までスクロールする（残課題図の H2）
// - ほかのページの箱を示すと、そのページへ移って示す（すぐ示す・郵便箱から開く。D37）
// - ブックを付けた郵便（notify -mail -page）は、郵便箱から開くとそのページを開く
import { type Page, expect, test } from "@playwright/test";
import { type TestServer, testServer } from "./server";

test.describe.configure({ mode: "parallel" });

let s: TestServer;
test.beforeEach(() => {
  s = testServer();
  // 最初のページ: 高さを決めたリスト（スクロールする）に 12 行。2 枚目のページ（p2）: 箱 30
  s.write("book.json", {
    world: { paper: "a4-landscape" },
    pages: [{ id: "p2", title: "二枚目" }],
    nodes: [
      { id: 10, caption: "一覧", childView: "list", listHeight: 200, x: 40, y: 40 },
      ...Array.from({ length: 12 }, (_, i) => ({ id: 11 + i, caption: `行 ${i + 1}`, parent: 10 })),
      { id: 30, caption: "向こうの箱", page: "p2", x: 40, y: 40 },
    ],
  });
});
test.afterEach(() => s.stop());

const selected = (page: Page) => page.locator('.tab[aria-selected="true"] .tab-name');
const frame = (page: Page) => page.locator(".stage:visible .mz-point");
const box = (page: Page, id: number) => page.locator(`.stage:visible .mz-node[data-id="${id}"]`);

async function openBook(page: Page) {
  await page.goto(s.run("open", "-no-browser", "book.json").trim());
  await expect(selected(page)).toHaveText("book.json");
}

// el が囲む箱 outer の中に見えているか（上下とも）
async function insideOf(page: Page, id: number, outer: string) {
  const r = (await box(page, id).boundingBox())!, o = (await page.locator(outer).boundingBox())!;
  return r.y >= o.y - 1 && r.y + r.height <= o.y + o.height + 1;
}

test("スクロールのリストの見えない行の箱を focus すると、リストをその行までスクロールして示す（H2）", async ({ page }) => {
  await openBook(page);
  const list = '.stage:visible .mz-node[data-id="10"] .mz-list-kids';
  expect(await insideOf(page, 22, list)).toBe(false); // 最後の行は、はじめは見えない
  expect(s.run("focus", "book.json", "22")).toContain("shown");
  await expect(frame(page)).toHaveCount(1);
  await expect.poll(() => insideOf(page, 22, list)).toBe(true);
  await expect.poll(() => insideOf(page, 22, ".stage:visible")).toBe(true);
});

test("ほかのページの箱を focus すると、そのページへ移って示す", async ({ page }) => {
  await openBook(page);
  expect(s.run("focus", "book.json", "30")).toContain("shown");
  await expect(selected(page)).toHaveText("二枚目");
  await expect(frame(page)).toHaveCount(1);
  await expect(box(page, 30)).toBeVisible();
});

test("郵便箱に入れたほかのページの箱のフォーカスは、開くとそのページへ移って示す", async ({ page }) => {
  await openBook(page);
  expect(s.run("focus", "-mail", "-title", "向こうを見て", "book.json", "30")).toContain("mailbox");
  await page.locator("#mail-toggle").click();
  await page.locator("#mailbox .mz-mail-row", { hasText: "向こうを見て" }).click();
  await page.locator(".mz-dlg [data-ok]").click(); // 郵便の中身のダイアログから示す
  await expect(selected(page)).toHaveText("二枚目");
  await expect(frame(page)).toHaveCount(1);
});

test("ブックを付けた郵便に -page を付けると、郵便箱から開いたときそのページを開く", async ({ page }) => {
  await openBook(page);
  expect(s.run("notify", "-mail", "-title", "二枚目を直しました", "-page", "p2", "book.json")).toContain("notified");
  await page.locator("#mail-toggle").click();
  await page.locator("#mailbox .mz-mail-row", { hasText: "二枚目を直しました" }).click();
  await page.locator(".mz-dlg [data-ok]").click(); // 郵便の中身のダイアログから開く
  await expect(selected(page)).toHaveText("二枚目");
});
