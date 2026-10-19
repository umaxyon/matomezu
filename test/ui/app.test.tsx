import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createAppStore } from "../../web/src/store/store";
import { App } from "../../web/src/ui/App";
import { StoreProvider } from "../../web/src/ui/store-context";

afterEach(cleanup);

function renderApp() {
  const store = createAppStore();
  render(<StoreProvider store={store}><App /></StoreProvider>);
  return store;
}

test("ステージに紙が 1 枚ある", () => {
  renderApp();
  expect(screen.getAllByRole("region", { name: "ステージ" })).toHaveLength(1);
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(1);
});

test("分割のボタンで、ステージが 2 つになり、それぞれに紙がある。もう一度押すと 1 つに戻る", () => {
  renderApp();
  const button = screen.getByRole("button", { name: "画面を分割" });
  fireEvent.click(button);
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(2);
  fireEvent.click(button);
  expect(screen.getAllByRole("img", { name: "紙" })).toHaveLength(1);
});

test("＋でページが増え、そのタブが選ばれる", () => {
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "ページを足す" }));
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map(t => t.textContent)).toEqual(["ページ 1", "ページ 2"]);
  expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
});
