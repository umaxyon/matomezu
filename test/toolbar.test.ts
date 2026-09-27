// ツールバーのテスト
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { setupHistory, setupModes } from "../web/src/toolbar";

let graph: Graph | null = null;
afterEach(() => {
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
  return { g: graph, $, undoBtn, redoBtn };
}

// キーボードの登録は外せないので、1つのテストの中で確かめる
test("Undo / Redo のボタンとキーボード", () => {
  const { g, $, undoBtn, redoBtn } = setup();
  setupHistory(g, undoBtn, redoBtn);
  const key = (k: string, opts: KeyboardEventInit = {}, target: EventTarget = document.body) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));

  expect([undoBtn.disabled, redoBtn.disabled]).toEqual([true, true]);
  g.update(1, { caption: "b" });
  expect(undoBtn.disabled).toBe(false);

  undoBtn.click();
  expect(g.info(1).caption).toBe("a");
  redoBtn.click();
  expect(g.info(1).caption).toBe("b");

  key("z", { ctrlKey: true });
  expect(g.info(1).caption).toBe("a");
  key("z", { ctrlKey: true, shiftKey: true });
  expect(g.info(1).caption).toBe("b");
  key("z", { metaKey: true }); // Mac の Cmd
  expect(g.info(1).caption).toBe("a");
  key("y", { ctrlKey: true });
  expect(g.info(1).caption).toBe("b");

  // 入力欄の中では、文字入力の取り消しに譲る
  key("z", { ctrlKey: true }, $("text"));
  expect(g.info(1).caption).toBe("b");
  // Ctrl なし、Alt 付きは無視する
  key("z");
  key("z", { ctrlKey: true, altKey: true });
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
