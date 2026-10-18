// 本文（長文）を入れられる箱（docs/BODY-plan.md）を実際のブラウザで確かめる
import { expect, test } from "@playwright/test";
import { openDiagram, rect, violations, choose } from "./helpers";

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test("子の見せ方を内包・リスト・非表示と切り替えても、本文は箱に収まる。ツリーのページの根では本体の中に入る", { tag: "@d44" }, async ({ page }) => {
  const nodes = [
    { id: 10, caption: "ログイン機能", body: "見出しの下に本文、その下に子が並びます。\n本文は箱の幅いっぱいで折り返します。", x: 40, y: 40 },
    { id: 11, parent: 10, caption: "ログイン画面", body: "メールアドレスとパスワードで入る。" },
    { id: 12, parent: 10, caption: "ロック", body: "失敗が 5 回続いたら 10 分ロックする。" },
  ];
  await openDiagram(page, { nodes });
  const fits = () => page.locator('.mz-node[data-id="10"] > .mz-head').evaluate(h => {
    const b = h.querySelector(".mz-body")!.getBoundingClientRect(), r = h.getBoundingClientRect();
    return b.height > 0 && b.bottom <= r.bottom + 0.5 && b.right <= r.right + 0.5;
  });
  expect(await fits()).toBe(true);
  for (const view of ["list", "hidden", "nest", "list", "nest"]) {
    await choose(page, 10, "view", view);
    await expect.poll(fits, { message: view }).toBe(true);
  }
  // ツリーのページ（パターンはページを作るときに決める。ここはデータで）: 根の本体に本文が入る
  await openDiagram(page, { world: { childView: "tree", root: 10 }, nodes });
  expect(await fits()).toBe(true);
});

test("リストの中で隠れていた子の中身も、内包に戻すと大きさを測り直し、本文が箱に収まる", { tag: "@d44" }, async ({ page }) => {
  await openDiagram(page, {
    nodes: [
      // 開いたときからリスト（中身は隠れた状態で初めて測る）
      { id: 10, caption: "ログイン機能", childView: "list", x: 40, y: 20 },
      { id: 12, parent: 10, caption: "ロック" },
      { id: 11, parent: 10, caption: "ログイン画面", body: "メールアドレスとパスワードで入る。" },
      { id: 20, parent: 11, caption: "画面一覧", childView: "list" },
      { id: 21, parent: 20, caption: "トップ", body: "おすすめ商品とお知らせを出す" },
      { id: 23, parent: 20, caption: "カート", body: "数量の変更と削除ができる。\n合計金額をすぐ出し直す。" },
    ],
  });
  const fits = (id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`).evaluate(h => {
    const b = h.querySelector(".mz-body")!.getBoundingClientRect(), r = h.getBoundingClientRect();
    return b.height > 0 && b.bottom <= r.bottom + 0.5;
  });
  const widths = () => Promise.all([21, 23].map(async id => Math.round((await rect(page, id)).w)));
  // ツリーは子孫全体に効き、画面一覧のリストまでツリーにしてしまうので、内包に戻して確かめる（docs/PATTERN-plan.md の 3.6 章）
  for (const view of ["nest"]) {
    await choose(page, 10, "view", view);
  }
  await expect.poll(() => fits(21)).toBe(true);
  await expect.poll(() => fits(23)).toBe(true);
  // リストの子の幅は、一番広い子の中身に合わせてそろう（0 と測ったままの狭い幅にならない）
  const [w1, w2] = await widths();
  expect(w1).toBe(w2);
  expect(w1).toBeGreaterThan(150);
});

