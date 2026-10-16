// タブの列の横スクロール（tab-scroll.ts。G5）。happy-dom には配置の計算が無いので、中身の幅と見えている幅を要素に持たせる
import { afterEach, expect, test } from "bun:test";
import { setupTabScroll } from "../web/src/tab-scroll";

afterEach(() => { document.body.innerHTML = ""; });

const tick = () => new Promise(r => setTimeout(r, 0)); // MutationObserver の知らせを待つ

// タブの列（グループ 2 つ。今のグループは 1 つ目）。scrollWidth と clientWidth を決め、scrollLeft は 0..max に収める
function setup(scrollWidth = 1000, clientWidth = 300) {
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  tabs.innerHTML = `<div class="tab-group tab-group-current">${[1, 2, 3].map(i => `<span class="tab" aria-selected="${i === 1}">p${i}</span>`).join("")}</div>
    <div class="tab-group"><span class="tab" aria-selected="true">q1</span></div>`;
  document.body.appendChild(tabs);
  let left = 0;
  Object.defineProperty(tabs, "scrollWidth", { configurable: true, get: () => scrollWidth });
  Object.defineProperty(tabs, "clientWidth", { configurable: true, get: () => clientWidth });
  Object.defineProperty(tabs, "scrollLeft", {
    configurable: true, get: () => left,
    set: v => { left = Math.max(0, Math.min(scrollWidth - clientWidth, v)); tabs.dispatchEvent(new Event("scroll")); },
  });
  const scrolled: string[] = [];
  for (const t of tabs.querySelectorAll<HTMLElement>(".tab")) t.scrollIntoView = () => { scrolled.push(t.textContent!); };
  // happy-dom は、変わらない classList.toggle でも class の変更を知らせる（ブラウザは知らせない）。そのままだと
  // ぼかしの付け直し → MutationObserver → ぼかしの付け直し… が止まらないので、変わるときだけ書き換えるブラウザの動きにそろえる
  const cl = tabs.classList, toggle = cl.toggle.bind(cl);
  cl.toggle = (c: string, force?: boolean) => { const want = force ?? !cl.contains(c); if (want !== cl.contains(c)) toggle(c, want); return want; };
  setupTabScroll(tabs);
  return { tabs, scrolled };
}
const fades = (tabs: HTMLElement) => ["fade-left", "fade-right"].filter(c => tabs.classList.contains(c));
const wheel = (tabs: HTMLElement, init: WheelEventInit) => {
  const e = new WheelEvent("wheel", { cancelable: true, bubbles: true, ...init });
  // happy-dom の WheelEvent は MouseEvent ではなく、ctrlKey を持たない
  if (init.ctrlKey) Object.defineProperty(e, "ctrlKey", { value: true });
  tabs.dispatchEvent(e);
  return e.defaultPrevented;
};

test("はみ出していれば、先にタブがある側の端をぼかす（左端なら右だけ、真ん中なら両方、右端なら左だけ）", () => {
  const { tabs } = setup();
  expect(fades(tabs)).toEqual(["fade-right"]);
  tabs.scrollLeft = 300;
  expect(fades(tabs)).toEqual(["fade-left", "fade-right"]);
  tabs.scrollLeft = 700;
  expect(fades(tabs)).toEqual(["fade-left"]);
});

test("はみ出していなければ、どちらの端もぼかさない", () => {
  const { tabs } = setup(300, 300);
  expect(fades(tabs)).toEqual([]);
});

test("縦のホイールで横にスクロールし、ブラウザの縦のスクロールは止める", () => {
  const { tabs } = setup();
  expect(wheel(tabs, { deltaY: 120 })).toBe(true);
  expect(tabs.scrollLeft).toBe(120);
  wheel(tabs, { deltaY: -50 });
  expect(tabs.scrollLeft).toBe(70);
});

test("横の動きが大きいホイール・Ctrl のホイール・はみ出していない列では、ブラウザのままにする", () => {
  const { tabs } = setup();
  expect(wheel(tabs, { deltaY: 10, deltaX: 40 })).toBe(false);
  expect(wheel(tabs, { deltaY: 100, ctrlKey: true })).toBe(false);
  expect(tabs.scrollLeft).toBe(0);
  const fit = setup(300, 300).tabs;
  expect(wheel(fit, { deltaY: 100 })).toBe(false);
});

test("今のグループで選んだタブを、見える位置までスクロールする（ほかのグループの選択では動かない）", async () => {
  const { tabs, scrolled } = setup();
  const [, p2, p3] = [...tabs.querySelectorAll<HTMLElement>(".tab-group-current .tab")];
  tabs.querySelector('.tab-group-current .tab[aria-selected="true"]')!.setAttribute("aria-selected", "false");
  p3!.setAttribute("aria-selected", "true");
  await tick();
  expect(scrolled).toEqual(["p3"]);
  // 選択が外れただけでは動かない
  p3!.setAttribute("aria-selected", "false");
  await tick();
  expect(scrolled).toEqual(["p3"]);
  p2!.setAttribute("aria-selected", "true");
  await tick();
  expect(scrolled).toEqual(["p3", "p2"]);
});

test("グループを切り替えたら、新しい今のグループで選んでいるタブを見せる", async () => {
  const { tabs, scrolled } = setup();
  const [g1, g2] = [...tabs.querySelectorAll<HTMLElement>(".tab-group")];
  g1!.classList.remove("tab-group-current");
  g2!.classList.add("tab-group-current");
  await tick();
  expect(scrolled.at(-1)).toBe("q1");
});

test("タブが増えたら、ぼかしを測り直す", async () => {
  const { tabs } = setup(300, 300);
  expect(fades(tabs)).toEqual([]);
  Object.defineProperty(tabs, "scrollWidth", { configurable: true, get: () => 900 });
  tabs.querySelector(".tab-group")!.insertAdjacentHTML("beforeend", `<span class="tab">p4</span>`);
  await tick();
  expect(fades(tabs)).toEqual(["fade-right"]);
});
