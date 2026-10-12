// トースト（toast.ts）: 画面の下に出て、時間が来るか押すと消える。断りの知らせ（notices.ts）はトーストで出す
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { handleGraphEvent } from "../web/src/notices";
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

test("断りの知らせ（パターンの違うページへ移せない、など）はトーストで出し、普通の知らせはヘッダーの状態の文字に出す", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, { nodes: [{ id: 1 }] }, { measureText: fakeMeasure });
  graphs.push(graph);
  const status: string[] = [];
  handleGraphEvent(graph, { kind: "crossPattern", from: "flow", to: "nest" }, s => status.push(s));
  handleGraphEvent(graph, { kind: "leafKids" }, s => status.push(s));
  handleGraphEvent(graph, { kind: "added", key: "1_箱" }, s => status.push(s));
  expect(shown().length).toBe(2);
  expect(shown()[0]!.textContent).toContain("パターンの違うページ");
  expect(status).toEqual(["「1_箱」を追加しました"]);
});
