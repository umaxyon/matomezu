import { expect, test } from "bun:test";
import { currentStage } from "../../web/src/core/workspace";
import { createAppStore } from "../../web/src/store/store";

test("ページを足すと、カレントのステージのブックに入り、そのステージで開く", () => {
  const { state, actions } = createAppStore();
  actions.split();
  actions.focusStage("s2");
  actions.addPage();
  const s = state.getState();
  expect(s.books.b1!.pages.map(p => p.id)).toEqual(["p1", "p2"]);
  expect(s.workspace.stages.map(st => st.page)).toEqual(["p1", "p2"]);
});

test("ページを開くのはカレントのステージ", () => {
  const { state, actions } = createAppStore();
  actions.addPage();
  actions.split();
  actions.focusStage("s2");
  actions.openPage("p1");
  const ws = state.getState().workspace;
  expect(ws.stages.map(st => st.page)).toEqual(["p2", "p1"]);
  expect(currentStage(ws).id).toBe("s2");
});

test("変わらない操作では知らせない", () => {
  const { state, actions } = createAppStore();
  let calls = 0;
  const off = state.subscribe(() => calls++);
  actions.focusStage("s1");
  actions.unsplit();
  off();
  expect(calls).toBe(0);
});
