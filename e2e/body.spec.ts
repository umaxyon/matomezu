// 本文（長文）を入れられる箱（docs/BODY-plan.md）を実際のブラウザで確かめる
import { expect, test } from "@playwright/test";
import { openDiagram, rect, select, violations } from "./helpers";

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test("本文はキャプションの下に左寄せで出る。選んだ箱の右の縁のつまみで幅を変えると、折り返しが減って低くなる", async ({ page }) => {
  await openDiagram(page, {
    nodes: [
      { id: 1, caption: "ログイン画面", size: "L", bodyWidth: 160, body: "メールアドレスとパスワードで入る。失敗が 5 回続いたら 10 分ロックする。", x: 40, y: 40 },
      { id: 2, caption: "右の箱", x: 420, y: 40 },
    ],
  });
  const body = page.locator('.mz-node[data-id="1"] .mz-body');
  await expect(body).toBeVisible();
  expect(await body.evaluate(b => getComputedStyle(b).textAlign)).toBe("left");
  const before = await rect(page, 1);
  await select(page, 1);
  const grip = page.locator('.mz-node[data-id="1"] .mz-body-grip');
  await expect(grip).toBeVisible();
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 + 60, g.y + g.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = await rect(page, 1);
  expect(after.w).toBeCloseTo(before.w + 60, 0);
  expect(after.h).toBeLessThan(before.h);
  expect(after.x).toBe(before.x); // 左上を保って右へ伸びる
});

test("子の見せ方を内包・リスト・ツリーと切り替えても、本文は箱に収まる（ツリーの根では本体の中に入る）", async ({ page }) => {
  await openDiagram(page, {
    nodes: [
      { id: 10, caption: "ログイン機能", body: "見出しの下に本文、その下に子が並びます。\n本文は箱の幅いっぱいで折り返します。", x: 40, y: 40 },
      { id: 11, parent: 10, caption: "ログイン画面", body: "メールアドレスとパスワードで入る。" },
      { id: 12, parent: 10, caption: "ロック", body: "失敗が 5 回続いたら 10 分ロックする。" },
    ],
  });
  const fits = () => page.locator('.mz-node[data-id="10"] > .mz-head').evaluate(h => {
    const b = h.querySelector(".mz-body")!.getBoundingClientRect(), r = h.getBoundingClientRect();
    return b.height > 0 && b.bottom <= r.bottom + 0.5 && b.right <= r.right + 0.5;
  });
  expect(await fits()).toBe(true);
  for (const view of ["list", "tree", "nest", "tree"]) {
    // 内包のときは本体の真ん中に子があるので、見出しの左上を押して選ぶ
    await page.locator('.mz-node[data-id="10"] > .mz-head').click({ position: { x: 8, y: 8 } });
    await page.locator(`#sidebar label:has(input[name="mzp-view"][value="${view}"])`).click();
    await expect.poll(fits, { message: view }).toBe(true);
  }
});

test("最大行数を選ぶと、超えた分を切って箱が低くなる。制限なしに戻すと全部出る", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "見出し", body: "一行目\n二行目\n三行目\n四行目\n五行目", x: 40, y: 40 }],
  });
  const full = await rect(page, 1);
  await page.locator('.mz-node[data-id="1"] > .mz-head .mz-text').dblclick();
  await page.locator('.mz-dlg [name="lines"]').selectOption("2");
  await page.keyboard.press("Control+Enter");
  await expect.poll(async () => (await rect(page, 1)).h).toBeLessThan(full.h);
  const body = page.locator('.mz-node[data-id="1"] .mz-body');
  // 2 行分の高さで、中身は切れている
  expect(await body.evaluate(b => b.scrollHeight > b.clientHeight + 1)).toBe(true);
  await page.locator('.mz-node[data-id="1"] > .mz-head .mz-text').dblclick();
  await page.locator('.mz-dlg [name="lines"]').selectOption("");
  await page.keyboard.press("Control+Enter");
  await expect.poll(async () => (await rect(page, 1)).h).toBe(full.h);
});
