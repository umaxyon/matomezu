import { expect, test } from "@playwright/test";

test("画面が開く", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "matomezu" })).toBeVisible();
});
