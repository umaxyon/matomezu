// 郵便箱（mailbox.ts。D26 の段階 3）
import { expect, test } from "bun:test";
import { badgeText } from "../web/src/mailbox";

test("未読の数の印は 0 なら出さず、99 を超えたら 99+", () => {
  expect([badgeText(0), badgeText(1), badgeText(99), badgeText(100), badgeText(120)]).toEqual(["", "1", "99", "99+", "99+"]);
});
