// 新しいブック・新しいページのダイアログ（new-book.ts・new-page.ts。D20・D27）
import { afterEach, beforeEach, expect, test } from "bun:test";
import { closeEditDialog } from "../web/src/edit-dialog";
import { DEFAULTS } from "../web/src/graph";
import { DEFAULT_ROUTE, DEFAULT_VIEW, STRATEGIES } from "../web/src/model";
import { openNewBookDialog } from "../web/src/new-book";
import { openNewPageDialog } from "../web/src/new-page";
import { DEFAULT_THEME, THEMES } from "../web/src/theme";
import type { PagePattern, WorldData } from "../web/src/types";
import { DEFAULT_PAPER, PAPER_NAMES } from "../web/src/validate";

const realFetch = globalThis.fetch;
let posted: unknown[] = [];
let reply: () => Response = () => Response.json({ id: "new1" });
beforeEach(() => {
  posted = [];
  reply = () => Response.json({ id: "new1" });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    posted.push({ url, body: JSON.parse(String(init?.body)) });
    return reply();
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  closeEditDialog();
  document.body.innerHTML = "";
});

const tick = () => new Promise(r => setTimeout(r, 5));
// happy-dom は innerHTML の <option selected> を正しく選ばないことがある（紙の選択で、A4 横に付けた selected が A5 横になる）。
// ブラウザと同じく selected の付いた選択肢を選び直してから読む
const dlg = () => {
  const o = document.querySelector<HTMLElement>(".mz-dlg-overlay")!;
  for (const s of o.querySelectorAll("select")) {
    const want = s.querySelector<HTMLOptionElement>("option[selected]");
    if (want && !s.dataset.fixed) { s.value = want.value; s.dataset.fixed = "1"; }
  }
  return o;
};
const set = (name: string, value: string) => {
  const el = dlg().querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
  el.value = value;
};
const pick = (name: string, value: string) => { dlg().querySelector<HTMLInputElement>(`[name="${name}"][value="${value}"]`)!.checked = true; };
const ok = () => dlg().querySelector<HTMLElement>("[data-ok]")!.click();
const views = () => [...dlg().querySelectorAll<HTMLInputElement>('[name="view"]')].map(i => i.value);

test("新しいブック: 既定のままなら題名だけを送り、world には既定と同じ値を書かない", async () => {
  const created: string[] = [];
  openNewBookDialog("a", id => created.push(id), () => {});
  expect(dlg().textContent).toContain("今見ている図と同じフォルダに作ります");
  set("caption", "  設計  ");
  ok();
  await tick();
  expect(posted).toEqual([{ url: "api/new", body: { near: "a", title: "設計", world: { title: "設計" } } }]);
  expect(created).toEqual(["new1"]);
});

test("新しいブック: 既定と違う値（テーマ・線の通り方・パターン・紙）だけを world に書く。題名が空なら world に題名を書かない", async () => {
  openNewBookDialog(null, () => {}, () => {});
  expect(dlg().textContent).toContain("最後に開いた図と同じフォルダに作ります");
  const theme = THEMES.find(th => th.id !== DEFAULT_THEME)!.id;
  const route = [...dlg().querySelectorAll<HTMLInputElement>('[name="route"]')].map(i => i.value).find(v => v !== DEFAULT_ROUTE)!;
  const view = views().find(v => v !== DEFAULT_VIEW && !STRATEGIES[v as PagePattern].descendants)!;
  const paper = PAPER_NAMES.find(p => p !== DEFAULT_PAPER)!;
  set("theme", theme);
  pick("route", route);
  pick("view", view);
  set("paper", paper);
  ok();
  await tick();
  const body = (posted[0] as { body: { near: string; title: string; world: WorldData } }).body;
  expect(body).toEqual({ near: "", title: "", world: { theme, route: route as WorldData["route"], childView: view as WorldData["childView"], paper } });
});

test("新しいブックでもツリーを選べ、根の箱を 1 つ置いて送る（ページを足すときと同じ）", async () => {
  openNewBookDialog("a", () => {}, () => {});
  const desc = views().find(v => STRATEGIES[v as PagePattern].descendants)!;
  expect(desc).toBeDefined();
  set("caption", "組織");
  pick("view", desc);
  ok();
  await tick();
  const body = (posted[0] as { body: { world: WorldData; nodes: unknown[] } }).body;
  expect(body.world).toEqual({ title: "組織", childView: desc as PagePattern, root: 1 });
  expect(body.nodes).toEqual([{ id: 1, caption: "組織", userAdded: true, x: DEFAULTS.rootAt.x, y: DEFAULTS.rootAt.y }]);
  closeEditDialog();
  openNewPageDialog(() => {});
  expect(views()).toContain(desc);
});

test("新しいブックを作れなければ、サーバーの理由を添えて failed に渡す", async () => {
  reply = () => new Response("  名前が重なっています \n", { status: 409 });
  const failed: string[] = [];
  openNewBookDialog("a", () => {}, m => failed.push(m));
  ok();
  await tick();
  expect(failed).toEqual(["図を作れませんでした: 名前が重なっています"]);
});

test("新しいページ: 題名（前後の空白を除く）と、既定と違う値だけの world を渡す。サーバーには送らない", () => {
  const got: { title: string; world: WorldData }[] = [];
  openNewPageDialog(spec => got.push(spec));
  set("caption", " 2 枚目 ");
  pick("view", "tree");
  ok();
  expect(got).toEqual([{ title: "2 枚目", world: { childView: "tree" } }]);
  expect(posted).toEqual([]);
});
