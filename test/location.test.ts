// 画面の外に覚えること（app-location.ts）: 開いているブックの並び（localStorage）と、表示中のブックとページ（URL）
import { afterEach, expect, test } from "bun:test";
import { loadSavedBooks, saveBooks, wantedFromUrl, writeUrl } from "../web/src/app-location";

const KEY = "matomezu.tabs";
// テストの画面は about:blank で、history.replaceState では URL を変えられない。happy-dom の setURL で http の URL にして、終わったら戻す
const happyDOM = (globalThis as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;
const start = location.href;
afterEach(() => {
  localStorage.removeItem(KEY);
  happyDOM.setURL(start);
});

test("開いていたブックの id を覚えて読む。以前の形 { d, p } も読み、形の違う行は捨てる", () => {
  saveBooks(["a", "b"]);
  expect(loadSavedBooks()).toEqual(["a", "b"]);
  localStorage.setItem(KEY, JSON.stringify([{ d: "x", p: "7" }, "y", 3, null, { p: "1" }]));
  expect(loadSavedBooks()).toEqual(["x", "y"]);
});

test("覚えが無い・壊れている・配列でないときは空", () => {
  expect(loadSavedBooks()).toEqual([]);
  localStorage.setItem(KEY, "{ broken");
  expect(loadSavedBooks()).toEqual([]);
  localStorage.setItem(KEY, JSON.stringify({ d: "a" }));
  expect(loadSavedBooks()).toEqual([]);
});

test("覚えられなくても（localStorage が使えない）落ちない", () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("denied"); } });
  try {
    expect(() => saveBooks(["a"])).not.toThrow();
    expect(loadSavedBooks()).toEqual([]);
  } finally {
    Object.defineProperty(globalThis, "localStorage", desc);
  }
});

test("表示中のブックとページを URL に書き、ほかの項目は残す。ページが null なら p を消す", () => {
  happyDOM.setURL("http://localhost/?x=1");
  writeUrl("book 1", "7");
  expect(wantedFromUrl()).toEqual({ book: "book 1", page: "7" });
  expect(new URLSearchParams(location.search).get("x")).toBe("1");
  writeUrl("b2", null);
  expect(wantedFromUrl()).toEqual({ book: "b2", page: null });
  expect(location.search).not.toContain("p=");
});

test("URL を書き換えられなくても（about:blank など）落ちない", () => {
  expect(() => writeUrl("a", "1")).not.toThrow();
});

test("URL に何も無ければ、頼まれたブックもページも無い", () => {
  happyDOM.setURL("http://localhost/");
  expect(wantedFromUrl()).toEqual({ book: null, page: null });
});
