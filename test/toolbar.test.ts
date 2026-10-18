// ツールバーのテスト
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createGraph, type Graph } from "../web/src/graph";
import { openModePicker } from "../web/src/mode-picker";
import { setupHistory, setupModes } from "../web/src/toolbar";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
let dispose: (() => void) | null = null;
afterEach(() => {
  dispose?.();
  dispose = null;
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

function setup() {
  document.body.innerHTML = `
    <button id="undo"></button><button id="redo"></button>
    <button id="mode-tool" data-mode="move"></button>
    <span id="label"></span><input id="text"><div id="stage"></div>`;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const undoBtn = $<HTMLButtonElement>("undo"), redoBtn = $<HTMLButtonElement>("redo");
  graph = createGraph($("stage"), { nodes: [{ id: 1, caption: "a" }] }, {
    measureText: fakeMeasure,
    onHistory: h => { undoBtn.disabled = !h.canUndo; redoBtn.disabled = !h.canRedo; },
  });
  dispose = setupHistory(graph, undoBtn, redoBtn);
  graph.update(1, { caption: "b" });
  return { g: graph, $, undoBtn, redoBtn };
}

const key = (k: string, opts: KeyboardEventInit = {}, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));

test("ボタンで戻る・進む。押せるかどうかが表示に出る", () => {
  const { g, undoBtn, redoBtn } = setup();
  expect([undoBtn.disabled, redoBtn.disabled]).toEqual([false, true]);
  undoBtn.click();
  expect(g.info(1).caption).toBe("a");
  expect([undoBtn.disabled, redoBtn.disabled]).toEqual([true, false]);
  redoBtn.click();
  expect(g.info(1).caption).toBe("b");
});

test("キーボード: Ctrl+Z、Ctrl+Shift+Z、Cmd+Z、Ctrl+Y", () => {
  const { g } = setup();
  key("z", { ctrlKey: true });
  expect(g.info(1).caption).toBe("a");
  key("z", { ctrlKey: true, shiftKey: true });
  expect(g.info(1).caption).toBe("b");
  key("z", { metaKey: true }); // Mac の Cmd
  expect(g.info(1).caption).toBe("a");
  key("y", { ctrlKey: true });
  expect(g.info(1).caption).toBe("b");
});

test("入力欄の中、Ctrl なし、Alt 付きでは戻らない", () => {
  const { g, $ } = setup();
  key("z", { ctrlKey: true }, $("text")); // 入力欄では、文字入力の取り消しに譲る
  key("z");
  key("z", { ctrlKey: true, altKey: true });
  expect(g.info(1).caption).toBe("b");
});

test("登録を外すと、キーもボタンも効かない", () => {
  const { g, undoBtn } = setup();
  dispose!();
  key("z", { ctrlKey: true });
  undoBtn.click();
  expect(g.info(1).caption).toBe("b");
});

function setupWithModes() {
  const r = setup();
  const button = r.$<HTMLButtonElement>("mode-tool");
  const disposeModes = setupModes(r.g, button, r.$("label"));
  const disposeHistory = dispose;
  dispose = () => { disposeHistory?.(); disposeModes(); };
  return { ...r, button };
}

const keyup = (k: string, opts: KeyboardEventInit = {}, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true, cancelable: true, ...opts }));

test("モードのボタンは押すたびに 選択 → 付け替え → 手のひら → 選択 と回し、絵と説明は今のモード（D39）", () => {
  const { g, $, button } = setupWithModes();
  expect([button.dataset.mode, button.getAttribute("aria-label"), button.title]).toEqual(["move", "選択モード", "選択モード: クリックでボックスや線を選ぶ / ドラッグでボックスを動かす / ポインタを乗せた箱の〇から線を引く（押すと付け替えモード）"]);
  expect(button.querySelector("svg")).not.toBeNull();
  button.click();
  expect([g.mode(), button.dataset.mode, $("label").textContent]).toEqual(["reparent", "reparent", "付け替えモード"]);
  expect(button.title).toBe("付け替えモード: ドラッグして落とした先のボックスの子にする（押すと手のひらモード）");
  button.click();
  expect([g.mode(), button.dataset.mode, $("label").textContent]).toEqual(["pan", "pan", "手のひらモード"]);
  button.click();
  expect([g.mode(), $("label").textContent]).toEqual(["move", "選択モード"]);
  // 追加のモードからは選択へ
  g.setMode("add");
  button.click();
  expect(g.mode()).toBe("move");
});

test("Ctrl（Mac は Cmd）を押してもモードは入れ替わらない（E19）", () => {
  const { g, button } = setupWithModes();
  key("Control", { ctrlKey: true });
  expect(g.mode()).toBe("move");
  keyup("Control");
  button.click();
  key("Meta", { metaKey: true });
  expect(g.mode()).toBe("reparent");
  keyup("Meta");
  expect(g.mode()).toBe("reparent");
});

test("図の側でモードが変わったら、ボタンとラベルもそれに合わせる", () => {
  const { g, $, button } = setupWithModes();
  button.click();    // 付け替えモード
  g.setMode("pan");  // 図の側で変える（右の長押しで選んだときなど）
  expect([button.dataset.mode, $("label").textContent]).toEqual(["pan", "手のひらモード"]);
  button.click();    // 図の側で変わったモードから回す
  expect(g.mode()).toBe("move");
});

test("選んだ線は Delete（Mac の delete は Backspace）で消える。入力欄の中では消さない", () => {
  document.body.innerHTML = `<button id="undo"></button><button id="redo"></button><input id="text"><div id="stage"></div>`;
  const $ = (id: string) => document.getElementById(id)!;
  graph = createGraph($("stage"), { nodes: [{ id: 1 }, { id: 2 }, { id: 3 }], edges: [[1, 2], [2, 3]] }, { measureText: fakeMeasure });
  dispose = setupHistory(graph, $("undo") as HTMLButtonElement, $("redo") as HTMLButtonElement);
  const ids = () => graph!.toJSON().edges!.map(e => (e as { id: string }).id);
  graph.selectEdge("e1");
  key("Delete", {}, $("text"));
  expect(ids()).toEqual(["e1", "e2"]);
  key("Delete");
  expect(ids()).toEqual(["e2"]);
  graph.selectEdge("e2");
  key("Backspace");
  expect(ids()).toEqual([]);
  key("z", { ctrlKey: true });
  expect(ids()).toEqual(["e2"]);
});

test("選んだ箱も Delete で消える（子孫ごと、消したものの一覧へ。Undo で戻る）。入力欄の中や、選択モード以外では消さない", () => {
  document.body.innerHTML = `<button id="undo"></button><button id="redo"></button><input id="text"><div id="stage"></div>`;
  const $ = (id: string) => document.getElementById(id)!;
  graph = createGraph($("stage"), { nodes: [{ id: 1 }, { id: 2 }, { id: 3, parent: 2 }], edges: [[1, 2]] }, { measureText: fakeMeasure });
  dispose = setupHistory(graph, $("undo") as HTMLButtonElement, $("redo") as HTMLButtonElement);
  const live = () => graph!.toJSON().nodes.map(n => n.id);
  graph.select(2);
  key("Delete", {}, $("text"));
  expect(live()).toEqual([1, 2, 3]);
  graph.setMode("reparent");
  key("Delete");
  expect(live()).toEqual([1, 2, 3]);
  graph.setMode("move");
  graph.select(2);
  key("Delete");
  expect(live()).toEqual([1]);
  expect(graph.toJSON().removed!.map(n => n.id)).toEqual([2, 3]);
  key("z", { ctrlKey: true });
  expect(live()).toEqual([1, 2, 3]);
});

test("ツールバーに線モードのボタンは無い（線は箱の〇から引く。モードのアイコンにも出さない）", () => {
  const html = new DOMParser().parseFromString(readFileSync(join(import.meta.dir, "../web/index.html"), "utf8"), "text/html");
  expect(html.querySelectorAll("[data-mode]").length).toBeGreaterThan(0);
  expect(html.querySelector('[data-mode="link"]')).toBeNull();
  const { g, $ } = setup();
  const close = openModePicker(g, $("stage"), { x: 100, y: 100 }, () => {});
  expect([...document.querySelectorAll<HTMLElement>(".mz-mpick-btn[data-mode]")].map(b => b.dataset.mode)).not.toContain("link");
  expect(document.querySelectorAll(".mz-mpick-btn[data-mode]").length).toBeGreaterThan(0);
  close();
});
