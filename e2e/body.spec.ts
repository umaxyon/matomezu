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
