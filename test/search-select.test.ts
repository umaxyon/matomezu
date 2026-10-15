// 文字で絞り込んで 1 つ選ぶ部品（search-select.ts。D29）
import { expect, test } from "bun:test";
import { createSearchSelect } from "../web/src/search-select";

const options = [
  { value: "p2", label: "処理の流れ" }, { value: "p3", label: "画面の一覧", note: "フローチャート" }, { value: "p4", label: "処理の例外" },
];
const labels = (el: HTMLElement) => [...el.querySelectorAll(".mz-ss-item .mz-ss-label")].map(x => x.textContent);

test("初めは全部の候補を出し、初期値を選んでいる。文字を入れると名前に含むものだけに絞る", () => {
  const s = createSearchSelect({ options, value: "p3", placeholder: "探す", empty: "ありません" });
  expect(labels(s.el)).toEqual(["処理の流れ", "画面の一覧", "処理の例外"]);
  expect(s.value()).toBe("p3");
  expect(s.el.querySelector('[aria-selected="true"] .mz-ss-label')!.textContent).toBe("画面の一覧");
  const input = s.el.querySelector<HTMLInputElement>(".mz-ss-input")!;
  input.value = "処理";
  input.dispatchEvent(new Event("input"));
  expect(labels(s.el)).toEqual(["処理の流れ", "処理の例外"]);
  expect(s.value()).toBe("p3"); // 絞り込んで見えなくなっても、選んだまま
  input.value = "無い";
  input.dispatchEvent(new Event("input"));
  expect(s.el.querySelector(".mz-ss-empty")!.textContent).toBe("ありません");
});

test("候補を押すか、↓ で動かして Enter で選ぶ。選び直すと知らせる", () => {
  const changed: string[] = [];
  const s = createSearchSelect({ options, value: null, placeholder: "探す", empty: "-", onChange: v => changed.push(v) });
  expect(s.value()).toBe(null);
  s.el.querySelector<HTMLElement>('[data-value="p4"]')!.click();
  expect(s.value()).toBe("p4");
  const input = s.el.querySelector<HTMLInputElement>(".mz-ss-input")!;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(s.value()).toBe("p3");
  expect(changed).toEqual(["p4", "p3"]);
});
