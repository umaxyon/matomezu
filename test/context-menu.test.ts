// 右クリックのメニュー（context-menu.ts。D42）: 既定のメニューに、パターンの決まり（STRATEGIES の menu）を重ねる
import { afterEach, expect, test } from "bun:test";
import { openBookDialog } from "../web/src/book-dialog";
import { applyRules, finish, type Row, setupContextMenu } from "../web/src/context-menu";
import { closeEditDialog } from "../web/src/edit-dialog";
import { createGraph, type Graph } from "../web/src/graph";
import { STRATEGIES } from "../web/src/model";
import { setupHistory } from "../web/src/toolbar";
import type { Diagram } from "../web/src/types";
import { fakeMeasure, pointsOf } from "./helpers";

const item = (id: string, label = id): Row => ({ id: id as never, label, enabled: true, run: () => {} });
const base = (): Row[] => [item("settings"), "hr", item("cut"), item("copy"), item("paste"), "hr", item("remove")];
const labels = (rows: Row[]) => finish(rows).map(x => (x === "hr" ? "|" : x.label));

test("決まりが無ければ既定のまま", () => {
  expect(labels(applyRules(base(), [{}]))).toEqual(["settings", "|", "cut", "copy", "paste", "|", "remove"]);
});

test("出さない項目は消え、先頭・末尾・続けての区切り線は残さない", () => {
  expect(labels(applyRules(base(), [{ hide: ["settings"] }]))).toEqual(["cut", "copy", "paste", "|", "remove"]);
  expect(labels(applyRules(base(), [{ hide: ["cut", "copy", "paste", "remove"] }]))).toEqual(["settings"]);
});

test("差し替えは見出しとショートカットを保ち、動きと使えるかを変える。追加は指定の項目の後ろ（null は一番上）", () => {
  const rows = applyRules([{ id: "settings", label: "設定", key: "Enter", enabled: false, run: () => {} }, "hr", item("remove")],
    [{ override: { settings: "appSettings" }, add: [{ action: "appSettings", after: "remove" }, { action: "appSettings", after: null }] }]);
  const s = rows[1] as Exclude<Row, "hr">;
  expect([s.label, s.key, s.enabled]).toEqual(["設定", "Enter", true]);
  expect(labels(rows)).toEqual(["設定", "設定", "|", "remove", "設定"]);
  // 足す先の項目が無ければ足さない
  expect(labels(applyRules([item("remove")], [{ add: [{ action: "appSettings", after: "heads" }] }]))).toEqual(["remove"]);
});

test("決まりは順に重ねる（窓は箱の決まりの上に窓の決まり）", () => {
  expect(labels(applyRules(base(), [{ hide: ["cut"] }, { hide: ["settings"] }]))).toEqual(["copy", "paste", "|", "remove"]);
});

test("マスター: 窓は設定を出さず、背景の設定は全体の設定。ほかのパターンは既定のまま", () => {
  expect(STRATEGIES.master.menu).toEqual({ window: { hide: ["settings"] }, world: { override: { settings: "appSettings" } } });
  for (const v of ["nest", "tree", "flow"] as const) expect(STRATEGIES[v].menu).toEqual({});
});

// ここから下は、図に右クリックを届けてメニューを押す（setupContextMenu。ショートカットは setupHistory）
let graph: Graph | null = null;
let disposers: (() => void)[] = [];
afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
  closeEditDialog();
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  document.body.innerHTML = `<button id="undo"></button><button id="redo"></button><div id="stage"></div>`;
  const $ = (id: string) => document.getElementById(id)!;
  const g = graph = createGraph($("stage"), data, { measureText: fakeMeasure });
  disposers.push(setupHistory(g, $("undo") as HTMLButtonElement, $("redo") as HTMLButtonElement),
    setupContextMenu(g, $("stage"), () => openBookDialog(g, "book.json")));
  return g;
}
const head = (id: number) => document.querySelector<HTMLElement>(`.mz-node[data-id="${id}"] > .mz-head`)!;
const rightClick = (el: Element, at = { x: 10, y: 8 }) =>
  el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
const menuButtons = () => [...document.querySelectorAll<HTMLButtonElement>(".mz-cmenu button")];
const press = (b: HTMLButtonElement) => b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const node = (id: number) => document.querySelector(`.mz-node[data-id="${id}"]`);
const key = (k: string, opts: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));

test("箱のメニューの削除で、その箱を消す", () => {
  setup({ nodes: [{ id: 1, caption: "消す箱", x: 40, y: 40 }, { id: 2, caption: "残す箱", x: 300, y: 40 }], edges: [] });
  rightClick(head(1));
  const del = menuButtons().at(-1)!;
  expect(del.disabled).toBe(false);
  press(del);
  expect(node(1)).toBeNull();
  expect(node(2)).not.toBeNull();
});

test("切り取り: メニューか Ctrl+X で写してから消し、貼ると戻る。Undo で戻せる", () => {
  setup({ nodes: [{ id: 1, caption: "切る箱", x: 40, y: 40 }, { id: 2, caption: "入れ物", x: 400, y: 40 }, { id: 3, caption: "キーで切る箱", x: 40, y: 300 }], edges: [] });
  rightClick(head(1));
  press(menuButtons()[1]!); // 切り取り
  expect(node(1)).toBeNull();
  // 入れ物の中に貼る
  rightClick(head(2));
  press(menuButtons()[3]!); // 貼り付け
  expect(document.querySelector('.mz-node[data-id="2"] .mz-node > .mz-head')?.textContent).toContain("切る箱");
  // Ctrl+X
  graph!.select(3);
  key("x", { ctrlKey: true });
  expect(node(3)).toBeNull();
  key("z", { ctrlKey: true }); // 戻せる
  expect(node(3)).not.toBeNull();
});

test("一番上の「設定」: 箱は編集ダイアログ、線は線の編集ダイアログ、背景はブックのダイアログを開く", () => {
  setup({
    nodes: [{ id: 1, caption: "左", x: 40, y: 40 }, { id: 2, caption: "右下", x: 400, y: 300 }],
    edges: [{ id: "e1", from: 1, to: 2, route: "straight" }],
  });
  const dlg = <T extends Element>(sel: string) => document.querySelector<T>(`.mz-dlg ${sel}`);
  const close = () => { press(dlg<HTMLButtonElement>("[data-cancel]")!); expect(document.querySelector(".mz-dlg")).toBeNull(); };
  // 箱
  rightClick(head(1));
  press(menuButtons()[0]!);
  expect(dlg<HTMLInputElement>('[name="caption"]')!.value).toBe("左");
  expect(dlg('[name="route"]')).toBeNull();
  close();
  // 線（真ん中。端から離れた所）
  const hit = document.querySelector('.mz-edge[data-id="e1"] .mz-hit')!;
  const [[x1, y1], [x2, y2]] = [pointsOf(hit)[0]!, pointsOf(hit).at(-1)!];
  rightClick(hit, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
  press(menuButtons()[0]!);
  expect(dlg('[name="route"]')).not.toBeNull();
  close();
  // 背景
  rightClick(document.querySelector(".mz-world")!, { x: 300, y: 500 });
  press(menuButtons()[0]!);
  expect(dlg('[name="book-title"]')).not.toBeNull();
  close();
});
