// help.ts のテスト。「?」マークに乗せる・キーボードで選ぶと吹き出しが出て、離れると消える
import { afterEach, expect, test } from "bun:test";
import { helpIcon, setupHelp } from "../web/src/help";

let off: (() => void) | null = null;
afterEach(() => {
  off?.();
  off = null;
  document.body.innerHTML = "";
});

function setup(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  off = setupHelp(root);
  return root;
}
const tip = () => document.querySelector<HTMLElement>(".mz-help-tip")!;

test("helpIcon は説明を文字として持つ（HTML として解釈しない）", () => {
  const root = setup(`<h3>見出し${helpIcon("<b>太字</b> & 説明")}</h3>`);
  const mark = root.querySelector<HTMLElement>(".mz-help")!;
  expect(mark.textContent).toBe("?");
  expect(mark.dataset.help).toBe("<b>太字</b> & 説明");
});

test("乗せると吹き出しが出て、離れると消える。キーボードで選んでも出る", () => {
  const root = setup(`<h3>見出し${helpIcon("説明です")}</h3><p>ほか</p>`);
  const mark = root.querySelector<HTMLElement>(".mz-help")!;
  expect(tip().hidden).toBe(true);
  mark.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  expect([tip().hidden, tip().textContent]).toEqual([false, "説明です"]);
  mark.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: root.querySelector("p") }));
  expect(tip().hidden).toBe(true);
  mark.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  expect(tip().hidden).toBe(false);
  mark.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  expect(tip().hidden).toBe(true);
});

test("折りたたみの見出しの中のマークを押しても、開け閉めしない", () => {
  const root = setup(`<details open><summary><h3>消したもの${helpIcon("説明")}</h3></summary><p>中身</p></details>`);
  root.querySelector<HTMLElement>(".mz-help")!.click();
  expect(root.querySelector("details")!.open).toBe(true);
});

test("外すと吹き出しの要素も消える", () => {
  setup(helpIcon("説明"));
  expect(document.querySelectorAll(".mz-help-tip").length).toBe(1);
  off!();
  off = null;
  expect(document.querySelectorAll(".mz-help-tip").length).toBe(0);
});
