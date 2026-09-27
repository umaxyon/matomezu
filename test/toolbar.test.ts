// ツールバーのテスト
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { setupHistory, setupModes } from "../web/src/toolbar";

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
    <span id="label"></span><input id="text"><div id="stage"></div>`;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const undoBtn = $<HTMLButtonElement>("undo"), redoBtn = $<HTMLButtonElement>("redo");
  graph = createGraph($("stage"), { nodes: [{ id: 1, caption: "a" }] }, {
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

test("モードの切り替えと表示", () => {
  const { g, $ } = setup();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
  setupModes(g, buttons, $("label"));
  buttons[1]!.click();
  expect(g.mode()).toBe("reparent");
  expect(buttons.map(b => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  expect($("label").textContent).toBe("付け替えモード");
  buttons[0]!.click();
  expect([g.mode(), $("label").textContent]).toEqual(["move", "移動モード"]);
});
