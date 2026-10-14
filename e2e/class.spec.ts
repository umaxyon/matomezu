// クラス図の形（docs/CLASS-plan.md）を実際のブラウザで確かめる
import { expect, test } from "@playwright/test";
import { openDiagram, violations } from "./helpers";
import type { Diagram } from "../web/src/types";

const SHOTS = process.env.SHOTS_DIR;

const data = (): Diagram => ({
  nodes: [
    {
      id: 1, shape: "class", caption: "User", abstract: true, x: 40, y: 60,
      attrs: [{ name: "id", type: "int", access: "private", static: true }, { name: "name", type: "string", access: "public" }, { name: "groupId", type: "int" }],
      ops: [{ name: "save", params: "force: boolean", type: "void", access: "public", abstract: true }],
    },
    { id: 2, shape: "class", caption: "Group", x: 420, y: 60, attrs: [{ name: "id", type: "int", access: "private" }], ops: [] },
    { id: 3, caption: "Service", x: 420, y: 300 },
  ],
  edges: [
    { id: "e1", from: 1, to: 2, fromMember: "groupId", toMember: "id", arrow: "end" },
    { id: "e2", from: 3, to: 1, arrow: "end" },
  ],
});

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

const head = (page: import("@playwright/test").Page, id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`);

test("区画と行を描き、行につないだ線は行の高さで左右につながる", async ({ page }) => {
  await openDiagram(page, data());
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/class.png` });
  const user = head(page, 1);
  await expect(user.locator(".mz-class-row")).toHaveText(["- id: int", "+ name: string", "groupId: int", "+ save(force: boolean): void"]);
  await expect(user).toHaveClass(/mz-class-abstract/);
  const row = (await user.locator('[data-member="groupId"]').boundingBox())!;
  const target = (await head(page, 2).locator('[data-member="id"]').boundingBox())!;
  const pts = await page.locator('.mz-edge[data-id="e1"] .mz-hit').evaluate(l => {
    const el = l as SVGPolylineElement, m = el.getScreenCTM()!;
    return el.getAttribute("points")!.trim().split(/\s+/).map(s => s.split(",").map(Number)).map(([x, y]) => [m.a * x! + m.e, m.d * y! + m.f]);
  });
  const [s, t] = [pts[0]!, pts.at(-1)!];
  expect(Math.abs(s[1]! - (row.y + row.height / 2))).toBeLessThanOrEqual(1.5);
  expect(Math.abs(t[1]! - (target.y + target.height / 2))).toBeLessThanOrEqual(1.5);
  const ub = (await user.boundingBox())!;
  expect(Math.abs(s[0]! - (ub.x + ub.width))).toBeLessThanOrEqual(1.5); // 相手のいる右側
});

const dlg = (page: import("@playwright/test").Page) => page.locator(".mz-dlg-overlay > .mz-dlg");

test("ダイアログで形をクラスにすると、右側がクラスの入力に変わる。行を足して確定すると描く", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "Order", x: 40, y: 60 }] });
  await head(page, 1).dblclick();
  await dlg(page).locator('label:has(input[name="shape"][value="class"])').click();
  await expect(dlg(page).locator('[data-pane="class"]')).toBeVisible();
  await expect(dlg(page).locator('[data-pane="box"]')).toBeHidden();
  await expect(dlg(page).locator("[data-caption-label]")).toHaveText("クラス名");
  await expect(dlg(page).locator('[name="size"][value="L"]')).toBeDisabled();
  await dlg(page).locator('[data-add="attrs"]').click();
  const row = dlg(page).locator('[data-list="attrs"] .mz-dlg-mrow').last();
  await row.locator('[name="m-name"]').fill("total");
  await row.locator('[name="m-type"]').fill("int");
  await row.locator('[name="m-access"]').selectOption("private");
  await dlg(page).locator('[data-add="ops"]').click();
  const op = dlg(page).locator('[data-list="ops"] .mz-dlg-mrow').last();
  await op.locator('[name="m-name"]').fill("pay");
  await op.locator('[name="m-params"]').fill("amount: int");
  await op.locator('[name="m-static"]').check();
  await dlg(page).locator('[name="abstract"]').check();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/class-dialog.png` });
  await dlg(page).locator("[data-ok]").click();
  await expect(head(page, 1).locator(".mz-class-row")).toHaveText(["- total: int", "pay(amount: int)"]);
  await expect(head(page, 1).locator(".mz-class-row").last()).toHaveClass(/mz-static/);
  await expect(head(page, 1)).toHaveClass(/mz-class-abstract/);
});

test("名前が重なると確定できない。クラスを別の形にすると確認が出て、キャンセルなら元のまま", async ({ page }) => {
  await openDiagram(page, data());
  await head(page, 2).dblclick();
  await dlg(page).locator('[data-add="attrs"]').click();
  await dlg(page).locator('[data-list="attrs"] .mz-dlg-mrow').last().locator('[name="m-name"]').fill("id");
  await dlg(page).locator("[data-ok]").click();
  await expect(dlg(page).locator("[data-member-error]")).toHaveText("属性・操作の名前が重なっています: id");
  await dlg(page).locator('[data-list="attrs"] .mz-dlg-mrow').last().locator("[data-del]").click();

  await dlg(page).locator('label:has(input[name="shape"][value="box"])').click();
  const sub = page.locator(".mz-dlg-sub");
  await expect(sub).toContainText("クラス名以外の情報");
  await sub.locator("[data-sub-cancel]").click();
  await expect(dlg(page).locator('[name="shape"]:checked')).toHaveValue("class");
  await expect(dlg(page).locator('[data-list="attrs"] .mz-dlg-mrow')).toHaveCount(1);
  // Esc は重ねた確認だけ閉じる
  await dlg(page).locator('label:has(input[name="shape"][value="box"])').click();
  await page.keyboard.press("Escape");
  await expect(sub).toHaveCount(0);
  await expect(dlg(page)).toBeVisible();
  // 変更すると、クラス名だけ残して捨てる。行につながっていた線は、クラスそのものではなく普通の箱の線になる
  await dlg(page).locator('label:has(input[name="shape"][value="box"])').click();
  await sub.locator("[data-sub-ok]").click();
  await expect(dlg(page).locator('[data-pane="box"]')).toBeVisible();
  await dlg(page).locator("[data-ok]").click();
  await expect(head(page, 2)).not.toHaveClass(/mz-shape-class/);
  await expect(head(page, 2).locator(".mz-text")).toHaveText("Group");
  await expect(page.locator('.mz-edge[data-id="e1"]')).toHaveCount(1);
});

test("子を持つ箱をクラスにするときは確認が出て、子は消したものの一覧へ移る", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "枠", x: 40, y: 60 }, { id: 2, caption: "子", parent: 1 }] });
  await head(page, 1).click({ position: { x: 10, y: 8 } });
  // 形は編集ダイアログで変える（サイドバーには出さない。2026-10-13 D26）。確認はダイアログの中に重ねて出る
  const sub = page.locator(".mz-dlg-sub");
  await page.keyboard.press("Enter");
  await dlg(page).locator('label:has(input[name="shape"][value="class"])').click();
  await expect(sub).toContainText("子 1 個");
  await sub.locator("[data-sub-ok]").click();
  await dlg(page).locator("[data-ok]").click();
  await expect(head(page, 1)).toHaveClass(/mz-shape-class/);
  await expect(page.locator('.mz-node[data-id="2"]')).toHaveCount(0);
});

test("クラスにポインタを乗せると、4 つの接点と行の左右に〇が出る。行の〇から相手の行へ引くと、行どうしをつなぐ", async ({ page }) => {
  await openDiagram(page, { nodes: data().nodes });
  await head(page, 1).hover();
  await expect(page.locator(".mz-port:visible")).toHaveCount(4 + 4 * 2);
  const port = page.locator('.mz-port-member[data-member="name"][data-side="r"]');
  const p = (await port.boundingBox())!;
  const target = (await head(page, 2).locator('[data-member="id"]').boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".mz-edge")).toHaveCount(1);
  const ends = await page.locator(".mz-edge .mz-hit").evaluate(l => {
    const el = l as SVGPolylineElement, m = el.getScreenCTM()!;
    return el.getAttribute("points")!.trim().split(/\s+/).map(s => s.split(",").map(Number)).map(([x, y]) => [m.a * x! + m.e, m.d * y! + m.f]);
  });
  const row = (await head(page, 1).locator('[data-member="name"]').boundingBox())!;
  expect(Math.abs(ends[0]![1]! - (row.y + row.height / 2))).toBeLessThanOrEqual(1.5);
  expect(Math.abs(ends.at(-1)![1]! - (target.y + target.height / 2))).toBeLessThanOrEqual(1.5);
});

test("クラスの上には付け替えで落とせない", async ({ page }) => {
  await openDiagram(page, data());
  await page.locator("#mode-reparent").click();
  const box = (await head(page, 3).boundingBox())!;
  const cls = (await head(page, 2).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(cls.x + cls.width / 2, cls.y + cls.height / 2, { steps: 8 });
  await expect(page.locator(".mz-ghost")).toHaveClass(/mz-ghost-no/);
  await page.mouse.up();
  await expect(page.locator('.mz-node[data-id="2"] .mz-node[data-id="3"]')).toHaveCount(0);
});

test("属性・操作の一覧は高さが決まっていて、行を足してもダイアログは伸びずにスクロールする", async ({ page }) => {
  await openDiagram(page, data());
  await head(page, 2).dblclick();
  const box = dlg(page);
  const before = (await box.boundingBox())!.height;
  const list = box.locator('[data-list="attrs"]');
  const listH = (await list.boundingBox())!.height;
  for (let i = 0; i < 8; i++) await box.locator('[data-add="attrs"]').click();
  expect((await box.boundingBox())!.height).toBe(before);
  expect((await list.boundingBox())!.height).toBe(listH);
  expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(list.locator(".mz-dlg-mrow").last().locator('[name="m-name"]')).toBeFocused();
  await expect(box.locator('[data-list="ops"]')).toHaveJSProperty("clientHeight", await box.locator('[data-list="ops"]').evaluate(el => el.clientHeight));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/class-dialog-scroll.png` });
});

// 行と行をつないだ線（区間を 1 つ持つ折れ線）
const memberLine = (): Diagram => ({
  nodes: [
    { id: 1, shape: "class", caption: "User", x: 40, y: 60, attrs: [{ name: "id" }, { name: "groupId" }] },
    { id: 2, shape: "class", caption: "Group", x: 420, y: 200, attrs: [{ name: "id" }] },
  ],
  edges: [{ id: "e1", from: 1, to: 2, fromMember: "groupId", toMember: "id" }],
});
const screenPts = (page: import("@playwright/test").Page) => page.locator('.mz-edge[data-id="e1"] .mz-hit').evaluate(l => {
  const el = l as SVGPolylineElement, m = el.getScreenCTM()!;
  return el.getAttribute("points")!.trim().split(/\s+/).map(s => s.split(",").map(Number)).map(([x, y]) => [m.a * x! + m.e, m.d * y! + m.f]);
});
const center = async (l: import("@playwright/test").Locator) => {
  const b = (await l.boundingBox())!;
  return [b.x + b.width / 2, b.y + b.height / 2] as const;
};
async function drag(page: import("@playwright/test").Page, from: readonly [number, number], to: readonly [number, number]) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.mouse.up();
}

test("線の端をドラッグすると、一番近い接点へつなぎ替える（別の行、行の反対側、クラスそのもの）", async ({ page }) => {
  await openDiagram(page, memberLine());
  await page.locator('.mz-edge[data-id="e1"] .mz-hit').click({ force: true });
  const user = head(page, 1);
  const start = () => page.locator('.mz-edge[data-id="e1"] .mz-ends circle').first();
  // 別の行（id）の右へ
  const id = (await user.locator('[data-member="id"]').boundingBox())!;
  await drag(page, await center(start()), [id.x + id.width + 6, id.y + id.height / 2]);
  let s = (await screenPts(page))[0]!;
  expect(Math.abs(s[1]! - (id.y + id.height / 2))).toBeLessThanOrEqual(1.5);
  // 行の左へ（相手は右にいるが、置いた側を覚える）
  await drag(page, await center(start()), [id.x - 6, id.y + id.height / 2]);
  s = (await screenPts(page))[0]!;
  expect(Math.abs(s[0]! - id.x)).toBeLessThanOrEqual(1.5);
  // 上の辺の真ん中へ（クラスそのもの）
  const ub = (await user.boundingBox())!;
  await drag(page, await center(start()), [ub.x + ub.width / 2, ub.y - 6]);
  s = (await screenPts(page))[0]!;
  expect(Math.abs(s[0]! - (ub.x + ub.width / 2))).toBeLessThanOrEqual(1.5);
  expect(Math.abs(s[1]! - ub.y)).toBeLessThanOrEqual(1.5);
  // 元に戻すと、行につないだ線に戻る
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  s = (await screenPts(page))[0]!;
  const g = (await user.locator('[data-member="groupId"]').boundingBox())!;
  expect(Math.abs(s[1]! - (g.y + g.height / 2))).toBeLessThanOrEqual(1.5);
});

test("折れ線の途中の区間（腹）や端の丸をダブルクリックしても、線の編集ダイアログが開く", async ({ page }) => {
  await openDiagram(page, memberLine());
  await page.locator('.mz-edge[data-id="e1"] .mz-hit').click({ force: true });
  await page.locator('.mz-edge[data-id="e1"] .mz-bend').first().dblclick({ force: true });
  await expect(dlg(page).locator("h2")).toHaveText("線の編集");
  await page.keyboard.press("Escape");
  await page.locator('.mz-edge[data-id="e1"] .mz-ends circle').last().dblclick({ force: true });
  await expect(dlg(page).locator("h2")).toHaveText("線の編集");
});
