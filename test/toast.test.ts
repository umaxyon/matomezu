// トースト（toast.ts）: 画面の下に出て、時間が来るか押すと消える。断りの知らせ（notices.ts）はトーストで出す
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { handleGraphEvent, noticeOf } from "../web/src/notices";
import { clearToasts, toast } from "../web/src/toast";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  clearToasts();
  document.body.innerHTML = "";
});
const shown = () => [...document.querySelectorAll<HTMLElement>(".mz-toast")];
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

test("トーストは画面に積まれ、押すと消え、時間が来ても消える。警告は印が付く", async () => {
  toast("ひとつ");
  const close = toast("ふたつ", { kind: "warn", duration: 500 });
  expect(shown().map(e => e.textContent)).toEqual(["iひとつ", "!ふたつ"]);
  expect(shown()[1]!.classList.contains("mz-toast-warn")).toBe(true);
  expect(document.querySelector(".mz-toasts")!.getAttribute("aria-live")).toBe("polite");
  shown()[0]!.click();
  await wait(300);
  expect(shown().map(e => e.textContent)).toEqual(["!ふたつ"]);
  await wait(500); // duration 500ms + 消える動き
  expect(shown()).toEqual([]);
  close(); // 消えたあとに呼んでも何も起きない
});

test("エラーのトーストは時間では消えず、返り値の関数か押したときに消える", async () => {
  const close = toast("保存できませんでした", { kind: "error" });
  expect(shown()[0]!.classList.contains("mz-toast-error")).toBe(true);
  expect(shown()[0]!.textContent).toBe("!保存できませんでした");
  await wait(100);
  expect(shown().length).toBe(1);
  close();
  await wait(300);
  expect(shown()).toEqual([]);
});

test("断りの知らせ（パターンの違うページへ移せない、など）はトーストで出し、普通の知らせは出さない", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, { nodes: [{ id: 1 }] }, { measureText: fakeMeasure });
  graphs.push(graph);
  handleGraphEvent(graph, { kind: "crossPattern", from: "flow", to: "nest" });
  handleGraphEvent(graph, { kind: "leafKids" });
  handleGraphEvent(graph, { kind: "added", key: "1_箱" });
  expect(shown().length).toBe(2);
  expect(shown()[0]!.textContent).toContain("パターンの違うページ");
});

test("知らせの文言: 添える項目は 0 のものを出さず「、」でつなぐ。紙は型の見出し、知らない型は名前のまま", () => {
  expect(noticeOf({ kind: "pasted", key: "1_箱", from: "設計", kids: 2, edges: 0 })).toBe("「1_箱」を移植しました（設計 から、子 2 個）");
  expect(noticeOf({ kind: "pasted", key: "1_箱", from: null, kids: 0, edges: 0 })).toBe("「1_箱」を移植しました");
  expect(noticeOf({ kind: "pasted", key: "1_箱", from: "設計", kids: 0, edges: 3, clipboard: true })).toBe("「1_箱」を貼り付けました（線 3 本）");
  expect(noticeOf({ kind: "copied", key: "1_箱", kids: 0 })).toBe("「1_箱」をコピーしました");
  expect(noticeOf({ kind: "purged", key: "1_箱", kids: 1 })).toBe("「1_箱」を完全に削除しました（子 1 個）");
  expect(noticeOf({ kind: "removed", key: "1_箱", kids: 1, cutEdges: 2 })).toBe("「1_箱」を消しました（子 1 個、線 2 本も）");
  expect(noticeOf({ kind: "moved", into: null, page: "2 枚目", cutEdges: 1 })).toBe("最上位（2 枚目）へ移しました（階層が変わったため、線を 1 本外しました）");
  expect(noticeOf({ kind: "aligned", count: 3, what: "height", partial: true })).toBe("子 3 個の高さをそろえました（中身の都合で狭められない子があります）");
  expect(noticeOf({ kind: "overPaper", paper: "謎の紙" })).toBe("紙（謎の紙）に収まらないので、しませんでした");
  expect(noticeOf({ kind: "unknownTheme", names: ["a", "b"] })).toBe("知らないテーマ（a、b）があります。標準として描いています");
});

