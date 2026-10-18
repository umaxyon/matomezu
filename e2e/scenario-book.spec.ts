// シナリオのテスト: LLM（CLI の matomezu）とユーザー（画面）が 1 冊のブックを往復で作る流れを、はじめから終わりまで通す。
// テストごとに自分のサーバーと状態のフォルダを持つ（e2e/server.ts の testServer。登録した図・郵便箱・LLM の履歴が前のテストから残らない）。
// 9: 複数ページのブックとリンクの箱、10: マスターで作ったブックを LLM が使う、15: フローチャートを画面で組む
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { type TestServer, testServer } from "./server";
import { confirmDialog, setMode } from "./helpers";

let s: TestServer;
test.describe.configure({ mode: "parallel" });
test.beforeEach(() => { s = testServer(); });
test.afterEach(() => { s.stop(); });

// ファイルの中身（画面の保存・書き戻しを待つときは expect.poll で読む）
const readJson = (name: string) => JSON.parse(readFileSync(join(s.dir, name), "utf8"));
// CLI が誤りで終わったときの出力（stdout と stderr）。誤りでなければ失敗にする
function runFails(...args: string[]): string {
  try {
    s.run(...args);
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string };
    return `${x.stdout ?? ""}${x.stderr ?? ""}`;
  }
  throw new Error(`matomezu ${args.join(" ")} should fail`);
}

const selected = (page: Page) => page.locator('.tab[aria-selected="true"] .tab-name');
const tabNames = (page: Page) => page.locator(".tab-group-current .tab .tab-name");
const stage = (page: Page) => page.locator(".stage:visible");
const headOf = (page: Page, id: number | string) => stage(page).locator(`.mz-node[data-id="${id}"] > .mz-head`);
// マスターの窓（ブックの題名で探す）
const masterWin = (page: Page, name: string) => stage(page).locator('.mz-node[data-id^="b-"]', { hasText: name });
// 要素の真ん中（画面の座標）
const center = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// LLM が図を開く（最初の 1 冊。画面が無いので、返った URL をユーザーが開く）
async function llmOpens(page: Page, file: string) {
  const url = s.run("open", "-no-browser", file).trim().split("\n")[0]!;
  await page.goto(url);
  await expect(stage(page).locator(".mz-world")).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
}

// サーバーは、open で頼まれた図を、そのあと 5 秒の間につながった画面にも知らせ直す（internal/server/hub.go の showReplay。
// サーバーを入れ替えた直後の取りこぼしを防ぐため）。その間に読み直すと、知らせ直しで最初のページが前に出るので、読み直しを確かめる前に過ぎるのを待つ
// （下の test.fixme のとおり、その間の読み直しは選んだページを保たない）
const REPLAY_MS = 5_000;
async function replayOver(openedAt: number) {
  await expect.poll(() => Date.now() - openedAt, { timeout: REPLAY_MS + 5_000, intervals: [250] }).toBeGreaterThan(REPLAY_MS + 500);
}

// ---------------------------------------------------------------------------------------------
// シナリオ 9: 複数ページのブックとリンク
// 最初のページは内包、p2 はツリー（根と子 3 つ）、p3 はフローチャート（3 つ。位置を書かないので整列して置かれる）
const book = {
  world: { title: "受注の全体" },
  pages: [
    { id: "p2", title: "組織", world: { childView: "tree", root: 10 } },
    { id: "p3", title: "流れ", world: { childView: "flow" } },
  ],
  nodes: [
    { id: 1, caption: "受付", x: 40, y: 40 },
    { id: 2, caption: "発送", x: 400, y: 40 },
    { id: 10, caption: "社長", page: "p2" },
    { id: 11, caption: "営業部", parent: 10 },
    { id: 12, caption: "開発部", parent: 10 },
    { id: 13, caption: "総務部", parent: 10 },
    { id: 20, caption: "開始", shape: "stadium", page: "p3" },
    { id: 21, caption: "在庫はある?", shape: "diamond", page: "p3" },
    { id: 22, caption: "出荷", page: "p3" },
  ],
  edges: [{ id: "e1", from: 1, to: 2 }, { id: "e2", from: 20, to: 21 }, { id: "e3", from: 21, to: 22 }],
};

test("シナリオ 9: 3 つのパターンのページを持つブックを LLM が開き、ユーザーがタブからリンクの箱を作る。LLM はページごとに確かめ、リンク先を替える。パターンの違うページへは CLI でも画面でも移せない。ページを消すとタブが閉じ、読み直しても選んだタブのまま", async ({ page }) => {
  // LLM: 書いて validate、open
  const file = s.write("book.json", book);
  expect(s.run("validate", file).trim()).toBe("ok");
  const opened = Date.now();
  await llmOpens(page, file);
  await expect(tabNames(page)).toHaveText(["受注の全体", "組織", "流れ"]);
  await expect(selected(page)).toHaveText("受注の全体");

  // ユーザー: 「流れ」のタブを図へドラッグして落とすと、リンクの箱を作るダイアログ（D29）
  const world = (await stage(page).locator(".mz-world").boundingBox())!;
  const tab = await center(page.locator(".tab-group-current .tab", { hasText: "流れ" }));
  await page.mouse.move(tab.x, tab.y);
  await page.mouse.down();
  await page.mouse.move(world.x + 160, world.y + 260, { steps: 4 });
  await page.mouse.move(world.x + 200, world.y + 300, { steps: 4 });
  await expect(page.locator(".mz-add-ghost")).toHaveCount(1);
  await page.mouse.up();
  const dlg = page.locator(".mz-dlg");
  await expect(dlg.locator("h2")).toHaveText("ページへのリンク");
  await expect(dlg.locator('[aria-selected="true"] .mz-ss-label')).toHaveText("流れ");
  await dlg.locator("[data-ok]").click();
  await expect(dlg).toHaveCount(0);
  await expect.poll(() => readJson("book.json").nodes.find((n: { link?: string }) => n.link === "p3")?.id).toBeDefined();
  const linkId: number = readJson("book.json").nodes.find((n: { link?: string }) => n.link === "p3").id;
  // 窓にはフローチャートのページの縮図（箱 3 つ）が映る
  const link = headOf(page, linkId);
  await expect(link.locator(".mz-link-badge")).toHaveText("フローチャート");
  await expect(link.locator(".mz-link-win .mm-box")).toHaveCount(3);
  const flowArt = await link.locator(".mz-link-win").innerHTML();

  // LLM: どのページも紙に収まる（check -page。ユーザーの画面は切り替えない）
  expect(s.run("check", file)).toContain("fits");
  for (const p of ["p2", "p3"]) expect(s.run("check", "-page", p, file)).toContain("fits");
  await expect(selected(page)).toHaveText("受注の全体");

  // LLM: リンク先をツリーのページへ替えると、窓の縮図もツリー（箱 4 つ）に替わる
  expect(s.run("set", file, `${linkId}.link=p2`)).toContain("written");
  await expect(link.locator(".mz-link-badge")).toHaveText("ツリー");
  await expect(link.locator(".mz-link-win .mm-box")).toHaveCount(4);
  expect(await link.locator(".mz-link-win").innerHTML()).not.toBe(flowArt);
  expect(s.run("check", file)).toContain("fits");

  // LLM: 内包の箱をフローチャートのページへ移す set は断られ、書かない
  const before = readFileSync(file, "utf8");
  expect(runFails("set", file, "1.page=p3")).toContain("different patterns");
  expect(readFileSync(file, "utf8")).toBe(before);

  // ユーザー: 付け替えのドラッグで「流れ」のタブの上に止めてページを切り替え、落としても断られる（トーストで知らせる）
  await setMode(page, "reparent");
  const box = (await headOf(page, 1).boundingBox())!;
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 10, box.y + box.height, { steps: 5 });
  const flowTab = await center(page.locator(".tab-group-current .tab", { hasText: "流れ" }));
  await page.mouse.move(flowTab.x, flowTab.y, { steps: 5 });
  await expect(selected(page)).toHaveText("流れ"); // 少し止まるとそのページに切り替わる
  const area = (await stage(page).boundingBox())!;
  await page.mouse.move(area.x + area.width - 200, area.y + area.height - 150, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".mz-toast-warn", { hasText: "パターンの違うページ（内包 → フローチャート）へは移せません" })).toBeVisible();
  await setMode(page, "move");
  expect(readJson("book.json").nodes.find((n: { id: number }) => n.id === 1).page).toBeUndefined();

  // ユーザー: 「組織」のタブを選んで読み直すと、選んだタブのまま
  await page.locator(".tab-group-current .tab", { hasText: "組織" }).click();
  await expect(selected(page)).toHaveText("組織");
  await replayOver(opened);
  await page.reload();
  await expect(tabNames(page)).toHaveText(["受注の全体", "組織", "流れ"]);
  await expect(selected(page)).toHaveText("組織");
  await expect(stage(page).locator(".mz-head", { hasText: "社長" })).toHaveCount(1);

  // LLM: フローチャートのページを消す（ページと、その箱と線をファイルから取り除く）と、タブが閉じ、check -page は誤りになる
  const now = readJson("book.json");
  now.pages = now.pages.filter((p: { id: string }) => p.id !== "p3");
  now.nodes = now.nodes.filter((n: { page?: string }) => n.page !== "p3");
  now.edges = now.edges.filter((e: { id: string }) => !["e2", "e3"].includes(e.id));
  writeFileSync(file, JSON.stringify(now));
  await expect(tabNames(page)).toHaveText(["受注の全体", "組織"]);
  await expect(selected(page)).toHaveText("組織");
  expect(runFails("check", "-page", "p3", file)).toMatch(/p3/);
  expect(s.run("validate", file).trim()).toBe("ok");
});

// ---------------------------------------------------------------------------------------------
// シナリオ 10: マスターで作ったブックを LLM が使う
test("シナリオ 10: ユーザーがマスターの道具箱でフローチャートのブックを作って箱を足し、LLM が validate・check・set で使う（作った人は残る）。マスターで複製すると、写しも正しく履歴は別。窓のメニューで一覧から外してもファイルは残り、open で一覧に戻る", async ({ page }) => {
  // 画面を出すために、LLM が 1 冊開いておく
  const first = s.write("first.json", { nodes: [{ id: 1, caption: "はじめ", x: 40, y: 40 }] });
  await llmOpens(page, first);

  // ユーザー: マスターの道具箱のブック追加で、フローチャートのブックを作る
  await page.locator("#master").click();
  await expect(selected(page)).toHaveText("マスター");
  await stage(page).locator('.mz-toolbox [data-tool="newBook"]').click();
  const dlg = page.locator(".mz-dlg");
  await expect(dlg.locator("h2")).toHaveText("新しい図");
  await dlg.locator('[name="caption"]').fill("手順書");
  await dlg.locator("label", { hasText: "フローチャート" }).click();
  await dlg.locator("[data-ok]").click();
  await expect(selected(page)).toHaveText("手順書");
  const made = join(s.dir, "手順書.json");
  expect(readJson("手順書.json").world).toMatchObject({ title: "手順書", childView: "flow", madeBy: "user" });

  // ユーザー: 道具箱の箱の道具で、押した所に箱を足す
  await stage(page).locator(".mz-world").click({ position: { x: 5, y: 5 } });
  await stage(page).locator('.mz-toolbox [data-tool="box"]').click();
  const world = (await stage(page).locator(".mz-world").boundingBox())!;
  await page.mouse.click(world.x + 300, world.y + 200);
  await dlg.locator('[name="caption"]').fill("受付");
  await dlg.locator("[data-ok]").click();
  await expect(dlg).toHaveCount(0);
  await expect(stage(page).locator(".mz-head", { hasText: "受付" })).toHaveCount(1);
  await expect.poll(() => readJson("手順書.json").nodes.length).toBe(1);
  const added = readJson("手順書.json").nodes[0];
  expect(added).toMatchObject({ caption: "受付", userAdded: true });

  // LLM: そのファイルを validate・check・set で使える。作った人（madeBy: user）は残る
  expect(s.run("validate", made).trim()).toBe("ok");
  expect(s.run("check", made)).toContain("fits");
  expect(s.run("set", made, `${added.id}.caption=受付する`, `${added.id}.userAdded=`)).toContain("written");
  await expect(stage(page).locator(".mz-head", { hasText: "受付する" })).toHaveCount(1);
  expect(readJson("手順書.json").world.madeBy).toBe("user");
  expect(s.run("validate", made).trim()).toBe("ok");
  expect(s.run("history", made)).toMatch(/^#1 .*\n\s*~ box 1: caption, userAdded/);
  expect(s.run("history", made, "1")).toContain("受付する");

  // ユーザー: マスターで窓を Ctrl+C、Ctrl+V して複製する（D23）
  await page.locator("#master").click();
  await expect(selected(page)).toHaveText("マスター");
  await masterWin(page, "手順書").first().locator(":scope > .mz-head").click({ position: { x: 6, y: 6 } });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(dlg.locator("h2")).toHaveText("ブックの複製");
  await expect(dlg.locator('[name="caption"]')).toHaveValue("手順書 (2)");
  await dlg.locator("[data-ok]").click();
  await expect(stage(page).locator('.mz-node[data-id="user"] .mz-node[data-id^="b-"]', { hasText: "手順書 (2)" })).toHaveCount(1);
  const copy = join(s.dir, "手順書 (2).json");
  expect(readJson("手順書 (2).json").world).toMatchObject({ title: "手順書 (2)", childView: "flow", madeBy: "user" });
  expect(readJson("手順書 (2).json").nodes.map((n: { caption: string }) => n.caption)).toEqual(["受付する"]);
  // 写しも LLM が使え、履歴は元のブックと別（元の set は写しの履歴に無い）
  expect(s.run("validate", copy).trim()).toBe("ok");
  expect(s.run("check", copy)).toContain("fits");
  expect(s.run("history", copy)).not.toContain("#1");
  expect(s.run("set", copy, `${added.id}.caption=写しの受付`)).toContain("written");
  expect(s.run("history", copy)).toMatch(/^#1 .*\n\s*~ box 1: caption$/m);
  expect(s.run("history", copy, "1")).toContain("写しの受付");
  expect(s.run("history", made)).not.toContain("#2"); // 写しへの set は元の履歴に入らない
  expect(readJson("手順書.json").nodes[0].caption).toBe("受付する");

  // ユーザー: 写しの窓の右クリックのメニューの削除で一覧から外す。ファイルは残る（D42）
  await masterWin(page, "手順書 (2)").first().locator(":scope > .mz-head").click({ button: "right", position: { x: 6, y: 6 } });
  await page.locator(".mz-cmenu button", { hasText: "削除" }).click();
  await expect(dlg.locator("h2")).toHaveText("一覧から外す");
  await dlg.locator("[data-ok]").click();
  await expect(masterWin(page, "手順書 (2)")).toHaveCount(0);
  await expect(masterWin(page, "手順書")).toHaveCount(1);
  expect(existsSync(copy)).toBe(true);
  expect(s.run("validate", copy).trim()).toBe("ok");

  // LLM: もう一度 open すると一覧に戻る（届いた知らせで開く）
  s.run("open", "-no-browser", copy);
  await dlg.locator("[data-ok]").click();
  await expect(selected(page)).toHaveText("手順書 (2)");
  await page.locator("#master").click();
  await expect(masterWin(page, "手順書 (2)")).toHaveCount(1);
});

// ---------------------------------------------------------------------------------------------
// シナリオ 15: フローチャートを画面で組む（e2e/flow.spec.ts の道具入れ・ひし形の線・整列の確かめを含む）
test("シナリオ 15: フローチャートのページで、道具箱（図の左端の真ん中）から箱を足し（キーボードでも）、足すダイアログで台形の向きを選び、ひし形から線を引いて Yes / No の候補を選ぶ。箱を動かして自動で整列すると線も戻る。保存したファイルは validate・check を通る", async ({ page }) => {
  const file = s.write("flow.json", { world: { childView: "flow" }, nodes: [{ id: 1, caption: "開始", shape: "stadium", x: 220, y: 40 }] });
  await llmOpens(page, file);
  const toolbox = stage(page).locator(".mz-toolbox");
  const dlg = page.locator(".mz-dlg");
  const world = () => stage(page).locator(".mz-world").boundingBox().then(b => b!);
  const nodeBy = (caption: string) => stage(page).locator(".mz-node", { has: page.locator(":scope > .mz-head", { hasText: caption }) });

  // 図の左上の空いた所を押すと、図の左端の上下の真ん中に道具箱が出る
  await stage(page).locator(".mz-world").click({ position: { x: 5, y: 5 } });
  await expect(toolbox).toBeVisible();
  const area = (await stage(page).boundingBox())!;
  const tb = (await toolbox.boundingBox())!;
  expect(tb.x - area.x).toBeLessThan(20);
  expect(Math.abs(tb.y + tb.height / 2 - (area.y + area.height / 2))).toBeLessThan(10);

  // ひし形の道具を押してから、置きたい所を押すと、その形を選んだダイアログ
  let w = await world();
  await toolbox.locator('[data-tool="diamond"]').click();
  await expect(page.locator("#mode-label")).toHaveText("追加モード");
  await page.mouse.click(w.x + 240, w.y + 180);
  await expect(dlg.locator('[name="shape"]:checked')).toHaveValue("diamond");
  await dlg.locator('[name="caption"]').fill("在庫はある?");
  await dlg.locator("[data-ok]").click();
  await expect(page.locator("#mode-label")).toHaveText("選択モード");
  await expect(nodeBy("在庫はある?").locator(":scope > .mz-head")).toHaveClass(/mz-shape-diamond/);

  // 台形の道具: 足すダイアログで向きの違う形（下が狭い台形）を絵で選べる。開き直した編集ダイアログでもその絵を選んでいる
  w = await world();
  await stage(page).locator(".mz-world").click({ position: { x: 5, y: 5 } });
  await toolbox.locator('[data-tool="trapezoid"]').click();
  await page.mouse.click(w.x + 560, w.y + 360);
  await expect(dlg.locator('[name="shape"]:checked')).toHaveValue("trapezoid");
  await dlg.locator('label:has(input[name="shape"][value="trapezoidAlt"])').click();
  await dlg.locator('[name="caption"]').fill("手で数える");
  await dlg.locator("[data-ok]").click();
  await expect(dlg).toHaveCount(0);
  const trap = nodeBy("手で数える").locator(":scope > .mz-head");
  await expect(trap).toHaveClass(/mz-shape-trapezoidAlt/);
  await trap.dblclick();
  await expect(dlg.locator('[name="shape"]:checked')).toHaveValue("trapezoidAlt");
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);

  // 道具をキーボードで押すと、置く所を指さずにすぐダイアログを開き、フローチャートの中に足す
  await headOf(page, 1).click();
  await expect(toolbox).toBeVisible();
  await toolbox.locator('[data-tool="circle"]').focus();
  await page.keyboard.press("Enter");
  await expect(dlg.locator('[name="shape"]:checked')).toHaveValue("circle");
  await dlg.locator('[name="caption"]').fill("出荷");
  await dlg.locator("[data-ok]").click();
  await expect(dlg).toHaveCount(0);
  await expect(nodeBy("出荷").locator(":scope > .mz-head")).toHaveClass(/mz-shape-circle/);
  await expect.poll(() => readJson("flow.json").nodes.length).toBe(4);

  // 線を引く: 箱にポインタを乗せて出る〇から、相手までドラッグする
  const idOf = async (caption: string) => Number(await nodeBy(caption).getAttribute("data-id"));
  const diamond = await idOf("在庫はある?"), circle = await idOf("出荷"), trapId = await idOf("手で数える");
  const drawLine = async (from: number, side: string, to: number) => {
    const n = stage(page).locator(".mz-edge").count();
    await headOf(page, from).hover();
    const p = await center(page.locator(`.mz-port[data-side="${side}"]`));
    const t = await center(headOf(page, to));
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 8 });
    await page.mouse.up();
    await expect(stage(page).locator(".mz-edge")).toHaveCount((await n) + 1);
  };
  await drawLine(1, "b", diamond);
  await drawLine(diamond, "b", circle);
  await drawLine(diamond, "r", trapId);
  await expect.poll(() => readJson("flow.json").edges?.length ?? 0).toBe(3);

  // 線をダブルクリックして編集ダイアログを開く（線の長さの真ん中の点を押す。折れ線の枠の真ん中は線の上とは限らない）
  const dblclickEdge = async (id: string) => {
    const at = await stage(page).locator(`.mz-edge[data-id="${id}"] .mz-hit`).evaluate(l => {
      const el = l as SVGPolylineElement, m = el.getScreenCTM()!;
      const ps = el.getAttribute("points")!.trim().split(/\s+/).map(q => q.split(",").map(Number) as [number, number]);
      const segs = ps.slice(1).map((q, i) => [ps[i]!, q, Math.hypot(q[0] - ps[i]![0], q[1] - ps[i]![1])] as const);
      let rest = segs.reduce((a, x) => a + x[2], 0) / 2;
      for (const [a, b, len] of segs) {
        if (rest <= len) {
          const x = a[0] + (b[0] - a[0]) * rest / len, y = a[1] + (b[1] - a[1]) * rest / len;
          return { x: m.a * x + m.e, y: m.d * y + m.f };
        }
        rest -= len;
      }
      return { x: m.a * ps[0]![0] + m.e, y: m.d * ps[0]![1] + m.f };
    });
    await page.mouse.dblclick(at.x, at.y);
    await expect(dlg).toBeVisible();
  };
  // ひし形から出る線の編集ダイアログには Yes / No の候補が出て、押すとキャプションに入る
  const edgeOf = (from: number, to: number): string =>
    readJson("flow.json").edges.find((e: { from: number; to: number }) => e.from === from && e.to === to).id;
  for (const [to, hint] of [[circle, "Yes"], [trapId, "No"]] as const) {
    const id = edgeOf(diamond, to);
    await dblclickEdge(id);
    await expect(dlg.locator('[data-hint="Yes"]')).toBeVisible();
    await expect(dlg.locator('[data-hint="No"]')).toBeVisible();
    await dlg.locator(`[data-hint="${hint}"]`).click();
    await expect(dlg.locator('[name="caption"]')).toHaveValue(hint);
    await confirmDialog(page);
    await expect(stage(page).locator(`.mz-edge[data-id="${id}"] .mz-label`)).toHaveText(hint);
  }
  await expect.poll(() => readJson("flow.json").edges.map((e: { caption?: string }) => e.caption ?? "").sort()).toEqual(["", "No", "Yes"]);
  // ひし形でない箱から出る線には候補が出ない
  await dblclickEdge(edgeOf(1, diamond));
  await expect(dlg).toBeVisible();
  await expect(dlg.locator("[data-hint]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);

  // 自動で整列（ブックのダイアログのページのタブ。押すと印が付き、確定のときに行う。D26）
  const autoAlign = async () => {
    await page.locator("#book").click();
    await dlg.locator("[data-auto-align]").click();
    await confirmDialog(page);
  };
  // 線ごとの点の並びと、箱の位置（線の重なりの順は触った線が手前に来るので変わる。id で並べる）
  const points = () => stage(page).locator(".mz-edge").evaluateAll(gs =>
    Object.fromEntries(gs.map(g => [(g as HTMLElement).dataset.id, g.querySelector(".mz-line")?.getAttribute("points")])));
  const spots = () => stage(page).locator(".mz-node").evaluateAll(ns =>
    Object.fromEntries(ns.map(n => [(n as HTMLElement).dataset.id, `${(n as HTMLElement).style.left},${(n as HTMLElement).style.top}`])));
  await autoAlign();
  await expect.poll(async () => JSON.stringify(await spots())).not.toContain("NaN");
  const aligned = await points(), alignedSpots = await spots();
  // 箱を動かすと線も変わる。整列し直すと、箱だけでなく線も整列したときの形に戻る
  for (const [id, dx, dy] of [[trapId, -300, 120], [circle, 260, 0]] as const) {
    const h = await center(headOf(page, id));
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + dx, h.y + dy, { steps: 20 });
    await page.mouse.up();
  }
  expect(await points()).not.toEqual(aligned);
  await autoAlign();
  await expect.poll(points).toEqual(aligned);
  expect(await spots()).toEqual(alignedSpots);

  // 保存したファイル: 位置が書かれ、validate・check を通る
  await expect.poll(() => readJson("flow.json").nodes.every((n: { x?: number; y?: number }) => n.x != null && n.y != null)).toBe(true);
  const saved = readJson("flow.json");
  expect(saved.nodes.map((n: { shape?: string }) => n.shape ?? "box").sort()).toEqual(["circle", "diamond", "stadium", "trapezoidAlt"]);
  expect(s.run("validate", file).trim()).toBe("ok");
  const out = s.run("check", file);
  expect(out).toContain("fits");
  expect(out).not.toMatch(/^(cross|through) /m);
});


test.fixme("読み直しても選んだページのタブのまま（matomezu open の直後 5 秒の間でも）", async ({ page }) => {
  // 不具合: サーバーは open の知らせを 5 秒の間つないだ画面に送り直す（hub.go の showReplay）。すでにその知らせで開いた画面が読み直しても送り直すので、
  // 選んだページ（URL の p=p2）ではなく最初のページが前に出る
  const file = s.write("book.json", book);
  await llmOpens(page, file);
  await page.locator(".tab-group-current .tab", { hasText: "組織" }).click();
  await expect(selected(page)).toHaveText("組織");
  expect(page.url()).toContain("p=p2");
  await page.reload();
  await expect(tabNames(page)).toHaveText(["受注の全体", "組織", "流れ"]);
  await expect(selected(page)).toHaveText("組織");
});
