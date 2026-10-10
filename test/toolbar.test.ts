// ツールバーのテスト
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
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
    <button data-mode="move" aria-pressed="true"></button><button data-mode="reparent" aria-pressed="false"></button>
    <button data-mode="remove" aria-pressed="false"></button>
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
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
  const disposeModes = setupModes(r.g, buttons, r.$("label"));
  const disposeHistory = dispose;
  dispose = () => { disposeHistory?.(); disposeModes(); };
  return { ...r, buttons };
}

const keyup = (k: string, opts: KeyboardEventInit = {}, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true, cancelable: true, ...opts }));

test("モードの切り替えと表示", () => {
  const { g, $, buttons } = setupWithModes();
  buttons[1]!.click();
  expect(g.mode()).toBe("reparent");
  expect(buttons.map(b => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
  expect($("label").textContent).toBe("付け替えモード");
  buttons[2]!.click();
  expect(buttons.map(b => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
  expect([g.mode(), $("label").textContent]).toEqual(["remove", "削除モード"]);
  buttons[0]!.click();
  expect([g.mode(), $("label").textContent]).toEqual(["move", "選択モード"]);
});

test("Ctrl を押している間だけ、移動と付け替えが入れ替わる。離すと戻る", () => {
  const { g, $, buttons } = setupWithModes();
  const pressed = () => buttons.map(b => b.getAttribute("aria-pressed"));
  key("Control", { ctrlKey: true });
  expect([g.mode(), $("label").textContent]).toEqual(["reparent", "付け替えモード"]);
  expect(pressed()).toEqual(["false", "true", "false"]);
  keyup("Control");
  expect([g.mode(), $("label").textContent]).toEqual(["move", "選択モード"]);
  buttons[1]!.click();
  key("Meta", { metaKey: true }); // Mac の Cmd
  expect(g.mode()).toBe("move");
  keyup("Meta");
  expect(g.mode()).toBe("reparent");
});

test("Ctrl を押しながらボタンを押すと、ふつうのクリックと同じくそのモードになる", () => {
  const { g, buttons } = setupWithModes();
  key("Control", { ctrlKey: true }); // 一時的に付け替え
  buttons[1]!.click();               // 付け替えを押す
  expect(g.mode()).toBe("reparent");
  keyup("Control");
  expect(g.mode()).toBe("reparent"); // 離しても付け替えのまま
  key("Control", { ctrlKey: true });
  buttons[0]!.click();               // Ctrl を押したまま移動を押す
  expect(g.mode()).toBe("move");
  keyup("Control");
  expect(g.mode()).toBe("move");
});

test("削除モードでは Ctrl で切り替わらない。入力欄や、ウィンドウから離れたときも", () => {
  const { g, $, buttons } = setupWithModes();
  buttons[2]!.click();
  key("Control", { ctrlKey: true });
  expect(g.mode()).toBe("remove");
  keyup("Control");
  buttons[0]!.click();
  key("Control", { ctrlKey: true }, $("text"));
  expect(g.mode()).toBe("move");
  keyup("Control", {}, $("text"));
  key("Control", { ctrlKey: true });
  window.dispatchEvent(new Event("blur"));
  expect(g.mode()).toBe("move");
});

test("ドラッグ中は切り替えず、手を離してから切り替える", () => {
  document.body.innerHTML = `
    <button data-mode="move" aria-pressed="true"></button><button data-mode="reparent" aria-pressed="false"></button>
    <button data-mode="remove" aria-pressed="false"></button><span id="label"></span><div id="stage"></div>`;
  const stage = document.getElementById("stage")!;
  graph = createGraph(stage, { nodes: [{ id: 1, caption: "a", x: 40, y: 40 }] }, { measureText: fakeMeasure });
  dispose = setupModes(graph, [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")], document.getElementById("label")!);
  graph.select(1);
  const head = stage.querySelector(".mz-node.mz-current > .mz-head")!;
  const fire = (type: string, x: number) =>
    head.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 0, pointerId: 1 }));
  fire("pointerdown", 0);
  fire("pointermove", 10);
  key("Control", { ctrlKey: true });
  expect(graph.mode()).toBe("move");
  fire("pointermove", 20);
  fire("pointerup", 20);
  expect(graph.mode()).toBe("reparent");
  expect(graph.info(1).x).toBe(60); // 移動のドラッグはそのまま終わる
});

test("図の側でモードが変わったら、ボタンとラベルもそれに合わせる", () => {
  const { g, $, buttons } = setupWithModes();
  buttons[2]!.click(); // 削除モード
  g.setMode("move");   // 図の側で変える（一覧から戻したときなど）
  expect(buttons.map(b => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
  expect($("label").textContent).toBe("選択モード");
  key("Control", { ctrlKey: true }); // 以後は移動モードを元に Ctrl で入れ替わる
  expect(g.mode()).toBe("reparent");
  keyup("Control");
  expect(g.mode()).toBe("move");
});

test("選んだ線は Delete（Mac の delete は Backspace）で消える。入力欄の中や、箱を選んでいるときは消さない", () => {
  document.body.innerHTML = `<button id="undo"></button><button id="redo"></button><input id="text"><div id="stage"></div>`;
  const $ = (id: string) => document.getElementById(id)!;
  graph = createGraph($("stage"), { nodes: [{ id: 1 }, { id: 2 }, { id: 3 }], edges: [[1, 2], [2, 3]] }, { measureText: fakeMeasure });
  dispose = setupHistory(graph, $("undo") as HTMLButtonElement, $("redo") as HTMLButtonElement);
  const ids = () => graph!.toJSON().edges!.map(e => (e as { id: string }).id);
  graph.select(1);
  key("Delete");
  expect(ids()).toEqual(["e1", "e2"]);
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
