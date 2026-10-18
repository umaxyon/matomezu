// 2026-09-28 にユーザーが画面で確認した動きを、実際のブラウザで確かめる。
// test/fixtures/three-levels.json の id: 1 タイトル、2 ユーザー、3 フロントエンド、5 トップ画面、10 バックエンド、17 外部サービス
import { expect, test } from "@playwright/test";
import { choose, dragBy, edgeEnds, example, lines, openDiagram, rect, select, setCaption, violations, openBoxDialog, confirmDialog } from "./helpers";

const LONG = "トップ画面あいうえおかきくけこさしすせそたちつてとなにぬねの".repeat(2);
// 線を除いた同じ図。線でつながった箱どうしは間隔が広がる（32・40px。layout.ts の gapBetween）ので、線と関係の無い動き
// （押し下げの間隔・ドラッグで通り抜ける・ワールドの幅）を確かめるテストは、こちらで開き直す
const withoutLines = () => ({ ...example("three-levels"), edges: [] });

test.beforeEach(async ({ page }) => {
  await openDiagram(page, example("three-levels"));
});
test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test("1行に収まる幅の文字は折り返さない（幅を小数まで測って切り上げる）", { tag: "@d44" }, async ({ page }) => {
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

test("文字を増やすと最大の幅まで広がって折り返し、減らすと元の大きさに縮む", { tag: "@d44" }, async ({ page }) => {
  const before = await rect(page, 5);
  await setCaption(page, 5, LONG);
  expect((await rect(page, 5)).w).toBe(240);
  expect(await lines(page, 5)).toBeGreaterThan(1);
  await setCaption(page, 5, "トップ画面");
  expect(await rect(page, 5)).toEqual(before);
});

test("押し下げた相手との間隔は、ちょうど 8px", { tag: "@d44" }, async ({ page }) => {
  await openDiagram(page, withoutLines());
  for (const n of [1, 2, 3]) {
    await setCaption(page, 5, LONG.repeat(n)); // トップ画面が伸びて、カート画面を押し下げる
    const top = await rect(page, 5), cart = await rect(page, 6);
    if (cart.y > top.y) expect(cart.y - (top.y + top.h)).toBe(8);
  }
});

test("キャプションを 1 行にすると、文字を減らせば縮み、増やせば上限の幅で切る", { tag: "@d44" }, async ({ page }) => {
  const before = await rect(page, 5);
  await setCaption(page, 5, LONG);
  await openBoxDialog(page, 5);
  await page.locator('.mz-dlg [name="one-line"]').check();
  await confirmDialog(page);
  expect(await rect(page, 5)).toMatchObject({ w: 240, h: 64 });
  await setCaption(page, 5, "トップ画面");
  expect((await rect(page, 5)).w).toBe(before.w);
  await setCaption(page, 5, LONG);
  expect((await rect(page, 5)).w).toBe(240);
});

test("最上位の見せ方を切り替えても元の位置に戻り、左上は動かず（内包のページの起点。docs/PAPER-plan.md の 4.6）、タイトルも動かない", { tag: "@d44" }, async ({ page }) => {
  const title = await rect(page, 1), front = await rect(page, 3);
  for (const v of ["hidden", "nest", "list", "nest", "hidden", "nest"]) {
    await choose(page, 3, "view", v);
    const r = await rect(page, 3);
    expect([r.x, r.y], v).toEqual([front.x, front.y]);
    expect(await rect(page, 1), v).toEqual(title);
  }
  expect(await rect(page, 3)).toEqual(front);
});

test("非表示にした最上位は、関係ない箱を変えても横へ動かず、内包に戻すと元の位置", { tag: "@d44" }, async ({ page }) => {
  // フロントエンドは開いたときにタイトルとわずかに重なって押し下げられ、元の位置を覚えている
  const front = await rect(page, 3);
  await choose(page, 3, "view", "hidden");
  const hidden = await rect(page, 3);
  await choose(page, 17, "view", "nest"); // 関係ない外部サービスを変える
  expect(await rect(page, 3)).toEqual(hidden);
  await choose(page, 3, "view", "nest");
  expect(await rect(page, 3)).toEqual(front);
});

test("ユーザーに長い文字を入れると、左上を保って広がり、右の大きい隣を右へ押す（下へはずらさない）。文字を戻せば両方とも元の位置", { tag: "@d44" }, async ({ page }) => {
  const front = await rect(page, 3), user = await rect(page, 2);
  await setCaption(page, 2, "ユーザー" + LONG);
  const u = await rect(page, 2), f = await rect(page, 3);
  expect([u.x, u.y]).toEqual([user.x, user.y]);
  expect(f.y).toBe(front.y);
  expect(f.x).toBeGreaterThan(front.x);
  expect(f.x).toBeGreaterThanOrEqual(u.x + u.w + 8);
  await setCaption(page, 2, "ユーザー");
  expect([await rect(page, 2), await rect(page, 3)]).toEqual([user, front]);
});

test("真横の相手への線は水平、真下の相手への線は垂直", async ({ page }) => {
  // 直線のとき（折れ線の自由な端は、前に描いた辺と位置を保つので、大きさが変わると折れることがある。docs/EDGE-SPEC.md）
  const d = example("three-levels");
  await openDiagram(page, { ...d, world: { ...d.world, route: "straight" } });
  const [, y1, , y2] = await edgeEnds(page, "e1"); // ユーザー - フロントエンド
  expect(y1).toBe(y2);
  const [x1, , x2] = await edgeEnds(page, "e2"); // フロントエンド - バックエンド
  expect(x1).toBe(x2);
  await choose(page, 3, "view", "hidden"); // 大きさが変わっても水平・垂直のまま
  expect((await edgeEnds(page, "e1"))[1]).toBe((await edgeEnds(page, "e1"))[3]);
  expect((await edgeEnds(page, "e2"))[0]).toBe((await edgeEnds(page, "e2"))[2]);
  await select(page, 3);
});

test("タイトルを下へ動かすと、触れた箱と入れ替わりながら止まらずに通る（docs/DRAG-plan.md）", async ({ page }) => {
  await openDiagram(page, withoutLines());
  const [title, user, front, back] = await Promise.all([rect(page, 1), rect(page, 2), rect(page, 3), rect(page, 10)]);
  // バックエンドの中ほどまで動かして離す
  await dragBy(page, 1, 0, back.y + 20 - title.y);
  // 触れた箱は、タイトルの高さ + 8 だけ上へずれる
  const up = title.h + 8;
  expect(await rect(page, 2)).toEqual({ ...user, y: user.y - up });
  expect(await rect(page, 3)).toEqual({ ...front, y: front.y - up });
  const back2 = await rect(page, 10);
  expect(back2).toEqual({ ...back, y: back.y - up });
  // 離すと、タイトルはバックエンドの下へ寄る
  expect((await rect(page, 1)).y).toBe(back2.y + back2.h + 8);
});

test("表示領域の幅に小数があっても、中身が収まっていればワールドははみ出さない（スクロールバーを出さない）", async ({ page }) => {
  // ワールドが表示領域の幅に合わせて決まるのは、紙の制限を受けないページだけ（マスター。D33）
  const d = withoutLines();
  await openDiagram(page, { ...d, world: { ...(d.world ?? {}), childView: "master" } } as never);
  // Windows の表示倍率などで表示領域の幅に小数が出る状態を、サイドバーの幅で作る
  for (const w of ["280.2px", "280.4px", "280.6px", "280.8px"]) {
    await page.evaluate(w => { document.getElementById("sidebar")!.style.width = w; }, w);
    await page.waitForTimeout(50);
    const r = await page.evaluate(() => {
      const s = document.getElementById("stage")!, world = document.querySelector<HTMLElement>(".mz-world")!;
      // スクロールバーの分を除いた、表示領域の中身の幅と高さ（小数まで）
      const rect = s.getBoundingClientRect();
      return {
        w: rect.width - (s.offsetWidth - s.clientWidth), h: rect.height - (s.offsetHeight - s.clientHeight),
        worldW: parseFloat(world.style.width), worldH: parseFloat(world.style.height),
      };
    });
    expect(r.worldW, w).toBeLessThanOrEqual(r.w);
    expect(r.worldH, w).toBeLessThanOrEqual(r.h);
  }
});

