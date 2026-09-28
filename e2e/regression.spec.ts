// 2026-09-28 にユーザーが画面で確認した動きを、実際のブラウザで確かめる。
// examples/three-levels.json の id: 1 タイトル、2 ユーザー、3 フロントエンド、5 トップ画面、10 バックエンド、17 外部サービス
import { expect, test } from "@playwright/test";
import {
  choose, edgeEnds, example, lines, openDiagram, rect, select, setCaption, violations,
} from "./helpers";

const LONG = "トップ画面あいうえおかきくけこさしすせそたちつてとなにぬねの".repeat(2);

test.beforeEach(async ({ page }) => {
  await openDiagram(page, example("three-levels"));
});
test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test("1行に収まる幅の文字は折り返さない（幅を小数まで測って切り上げる）", async ({ page }) => {
  // 文字数を1つずつ増やし、最大の幅（M は 240）に届かないうちは1行のまま
  const texts = [
    ...Array.from({ length: 16 }, (_, i) => "トップ画面あいうえおかきくけこさし".slice(0, i + 1)),
    ...Array.from({ length: 20 }, (_, i) => "Android iOS 1234567 abc".slice(0, i + 4)),
  ];
  for (const t of texts) {
    await setCaption(page, 5, t);
    const r = await rect(page, 5);
    if (r.w < 240) expect(await lines(page, 5), t).toBe(1);
  }
});

test("文字を増やすと最大の幅まで広がって折り返し、減らすと元の大きさに縮む", async ({ page }) => {
  const before = await rect(page, 5);
  await setCaption(page, 5, LONG);
  expect((await rect(page, 5)).w).toBe(240);
  expect(await lines(page, 5)).toBeGreaterThan(1);
  await setCaption(page, 5, "トップ画面");
  expect(await rect(page, 5)).toEqual(before);
});

test("切り詰めるにすると1行になり、文字を減らせば縮み、増やせば上限の幅で切る", async ({ page }) => {
  const before = await rect(page, 5);
  await setCaption(page, 5, LONG);
  await choose(page, 5, "mzp-overflow", "clip");
  expect(await rect(page, 5)).toMatchObject({ w: 240, h: 64 });
  await setCaption(page, 5, "トップ画面");
  expect((await rect(page, 5)).w).toBe(before.w);
  await setCaption(page, 5, LONG);
  expect((await rect(page, 5)).w).toBe(240);
});

test("最上位の見せ方を切り替えても元の位置に戻り、上辺と横の中心は動かず、タイトルも動かない", async ({ page }) => {
  const title = await rect(page, 1), front = await rect(page, 3);
  const top = (r: { x: number; y: number; w: number }) => [r.x + r.w / 2, r.y];
  for (const v of ["tree", "nest", "hidden", "tree", "nest", "hidden", "nest"]) {
    await choose(page, 3, "mzp-view", v);
    const r = await rect(page, 3);
    expect(Math.abs(top(r)[0]! - top(front)[0]!), v).toBeLessThanOrEqual(1);
    expect(r.y, v).toBe(front.y);
    expect(await rect(page, 1), v).toEqual(title);
  }
  expect(await rect(page, 3)).toEqual(front);
});

test("非表示にした最上位は、関係ない箱を変えても横へ動かず、内包に戻すと元の位置", async ({ page }) => {
  // フロントエンドは開いたときにタイトルとわずかに重なって押し下げられ、元の位置を覚えている
  const front = await rect(page, 3);
  await choose(page, 3, "mzp-view", "hidden");
  const hidden = await rect(page, 3);
  await choose(page, 17, "mzp-view", "nest"); // 関係ない外部サービスを変える
  expect(await rect(page, 3)).toEqual(hidden);
  await choose(page, 3, "mzp-view", "nest");
  expect(await rect(page, 3)).toEqual(front);
});

test("ユーザーに長い文字を入れても右の大きい隣へ飛ばず、ワールドの余白を残して手前で折り返す", async ({ page }) => {
  const front = await rect(page, 3), user = await rect(page, 2);
  await setCaption(page, 2, "ユーザー" + LONG);
  const u = await rect(page, 2);
  expect(u.x).toBe(12);
  expect(u.x + u.w).toBeLessThanOrEqual(front.x - 8);
  expect(await lines(page, 2)).toBeGreaterThan(1);
  expect(await rect(page, 3)).toEqual(front);
  await setCaption(page, 2, "ユーザー"); // 左端で寄せられても、文字を戻せば元の位置
  expect(await rect(page, 2)).toEqual(user);
});

test("真横の相手への線は水平、真下の相手への線は垂直", async ({ page }) => {
  const [, y1, , y2] = await edgeEnds(page, 0); // ユーザー - フロントエンド
  expect(y1).toBe(y2);
  const [x1, , x2] = await edgeEnds(page, 1); // フロントエンド - バックエンド
  expect(x1).toBe(x2);
  await choose(page, 3, "mzp-view", "tree"); // 大きさが変わっても水平・垂直のまま
  expect((await edgeEnds(page, 0))[1]).toBe((await edgeEnds(page, 0))[3]);
  expect((await edgeEnds(page, 1))[0]).toBe((await edgeEnds(page, 1))[2]);
  await select(page, 3);
});
