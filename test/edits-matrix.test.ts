// edits.ts のうち、edits.test.ts と class.test.ts で見ていない分岐（箱を足す・完全に削除する・ページをまたぐ付け替え・
// 線の形・振り直す番号の境目・クラスの変更の項目ごとの扱い）を、図を作らずに確かめる
import { describe, expect, test } from "bun:test";
import { addBox, applyClassEdit, canPurge, moveSubtree, pasteSubtree, purgeRemoved, removeSubtree, restoreSubtree } from "../web/src/edits";
import { pageOf } from "../web/src/pages";
import type { BoxData, Diagram, EdgeData } from "../web/src/types";
import { problems } from "../web/src/validate";

// 最初のページに 1（子 2・孫 3）と 4、ページ p2 に 5（子 6）と 7。線は 1-4（最初のページの最上位）、5-7（p2 の最上位）と、配列で書いた 6-6
const book = (): Diagram => ({
  pages: [{ id: "p2" }],
  nodes: [
    { id: 1, caption: "A" }, { id: 2, parent: 1 }, { id: 3, parent: 2 }, { id: 4 },
    { id: 5, page: "p2" }, { id: 6, parent: 5 }, { id: 7, page: "p2" },
  ],
  edges: [{ id: "e1", from: 1, to: 4 }, { id: "e2", from: 5, to: 7 }, [6, 6]],
});
const ids = (d: Diagram) => d.nodes.map(n => n.id);
const edgeIds = (d: Diagram) => (d.edges ?? []).map(e => (Array.isArray(e) ? `${e[0]}-${e[1]}` : (e as EdgeData).id));

describe("addBox", () => {
  test("id は箱と消した箱の最大の次。ユーザーが足した印を付け、fields の id と userAdded は上書きする", () => {
    const d = book();
    removeSubtree(d, 7);
    expect(addBox(d, { caption: "新", id: 1, userAdded: false } as Partial<BoxData>, { page: null }, null)).toBe(8);
    expect(d.nodes.at(-1)).toEqual({ caption: "新", id: 8, userAdded: true });
  });
  test("置き場所: 親の中なら parent だけ、ページの最上位なら page だけ（最初のページは書かない）。位置は丸める", () => {
    const d = book();
    const a = addBox(d, {}, { parent: 5, page: "p2" }, { x: 1.4, y: 2.6 });
    const b = addBox(d, {}, { page: "p2" }, null);
    const c = addBox(d, {}, { page: null }, null);
    const [na, nb, nc] = [a, b, c].map(id => d.nodes.find(n => n.id === id)!);
    expect([na!.parent, na!.page, na!.x, na!.y]).toEqual([5, undefined, 1, 3]);
    expect([nb!.parent, nb!.page, "x" in nb!]).toEqual([undefined, "p2", false]);
    expect([nc!.parent, "page" in nc!]).toEqual([undefined, false]);
    expect([pageOf(d.nodes, a), pageOf(d.nodes, b), pageOf(d.nodes, c)]).toEqual(["p2", "p2", null]);
    expect(problems(d)).toEqual([]);
  });
  test("before の箱の前に入れる（リストの間への差し込み）。無い id なら末尾", () => {
    const d = book();
    addBox(d, {}, { parent: 1, page: null }, null, 2);
    expect(ids(d).slice(0, 3)).toEqual([1, 8, 2]);
    addBox(d, {}, { page: null }, null, 99);
    expect(ids(d).at(-1)).toBe(9);
    addBox(d, {}, { page: null }, null, "1"); // id は文字列でも同じ箱
    expect(ids(d)[0]).toBe(10);
  });
  test("数でない id の箱があっても、数の id の続きから振る", () => {
    const d: Diagram = { nodes: [{ id: "a" }, { id: 3 }] };
    expect(addBox(d, {}, { page: null }, null)).toBe(4);
  });
});

describe("purgeRemoved と canPurge（ユーザーが足した箱だけ完全に削除できる）", () => {
  const removedBook = () => {
    const d: Diagram = {
      nodes: [{ id: 9 }],
      removed: [
        { id: 1, userAdded: true }, { id: 2, parent: 1, userAdded: true },
        { id: 3, userAdded: true }, { id: 4, parent: 3 }, // 子が LLM の箱
        { id: 5 },
      ],
    };
    return d;
  };
  test("子孫まで全部がユーザーの足した箱なら消せる。子孫の数を返し、ほかの消した箱は残す", () => {
    const d = removedBook();
    expect([canPurge(d.removed!, 1), canPurge(d.removed!, 3), canPurge(d.removed!, 5), canPurge(d.removed!, 2)]).toEqual([true, false, false, true]);
    expect(purgeRemoved(d, 1)).toBe(2);
    expect(d.removed!.map(n => n.id)).toEqual([3, 4, 5]);
  });
  test("LLM の箱を含むものは消せず、データは変わらない。消したものに無い id も断る", () => {
    const d = removedBook();
    const before = JSON.stringify(d);
    expect(() => purgeRemoved(d, 3)).toThrow("ユーザーが足した箱だけ");
    expect(() => purgeRemoved(d, 5)).toThrow("ユーザーが足した箱だけ");
    expect(() => purgeRemoved(d, 9)).toThrow("消したボックスにありません");
    expect(JSON.stringify(d)).toBe(before);
  });
  test("最後の 1 つを消すと removed を項目ごと消す", () => {
    const d: Diagram = { nodes: [], removed: [{ id: 1, userAdded: true }] };
    purgeRemoved(d, 1);
    expect("removed" in d).toBe(false);
  });
});

describe("moveSubtree（ページをまたぐ付け替え）", () => {
  test("ほかのページの最上位へ移すと、元のページの最上位どうしの線は外れ、移した木の中の線は残る", () => {
    const d = book();
    d.edges!.push({ id: "e3", from: 2, to: 2 });
    expect(moveSubtree(d, 1, { page: "p2" }, null)).toBe(1); // e1（1-4）
    expect(edgeIds(d)).toEqual(["e2", undefined, "e3"]); // undefined は配列で書いた 6-6（{ from, to } に直る）
    expect([pageOf(d.nodes, 1), pageOf(d.nodes, 3)]).toEqual(["p2", "p2"]);
    expect(problems(d)).toEqual([]);
  });
  test("同じページの最上位どうしになった線は残る（ページの id は文字列と数で比べない）", () => {
    const d = book();
    d.edges!.push({ id: "e3", from: 4, to: 7 });
    // 4 を p2 の最上位へ。4-7 は同じページの最上位どうしになるので残り、1-4 は外れる
    expect(moveSubtree(d, 4, { page: "p2" }, null)).toBe(1);
    expect(edgeIds(d)).toEqual(["e2", undefined, "e3"]);
  });
  test("配列で書いた線は { from, to } の形に直る（線は残る）", () => {
    const d = book();
    moveSubtree(d, 4, { page: null }, { x: 0, y: 0 });
    expect(d.edges!.at(-1)).toEqual({ from: 6, to: 6 });
  });
  test("無い箱は断る。自分自身の中へも移せない", () => {
    expect(() => moveSubtree(book(), 99, { page: null }, null)).toThrow("ボックスがありません: 99");
    expect(() => moveSubtree(book(), 1, { parent: 1, page: null }, null)).toThrow("自分や自分の子孫");
  });
});

describe("removeSubtree と restoreSubtree", () => {
  test("消す: 子孫につながる線も数え、前に消した箱の後ろに足す。無い箱は断る", () => {
    const d = book();
    d.edges!.push({ id: "e3", from: 3, to: 3 });
    removeSubtree(d, 4);
    const r = removeSubtree(d, 1);
    expect(r.cut).toBe(1); // e3（e1 は 4 と一緒に消えた）
    expect(d.removed!.map(n => n.id)).toEqual([4, 1, 2, 3]);
    expect(() => removeSubtree(d, 1)).toThrow("ボックスがありません: 1");
  });
  test("戻す: 根だけを置き場所へ、子孫は親子のまま末尾へ。ほかの消した箱は残し、線は戻さない", () => {
    const d = book();
    removeSubtree(d, 4);
    removeSubtree(d, 1);
    restoreSubtree(d, 2, { page: "p2" }, { x: 5.5, y: 0 });
    expect(d.removed!.map(n => n.id)).toEqual([4, 1]);
    expect(d.nodes.slice(-2)).toEqual([{ id: 2, page: "p2", x: 6, y: 0 }, { id: 3, parent: 2 }]);
    expect(edgeIds(d)).toEqual(["e2", undefined]);
    // 親が消えたままの 1 も戻せる。parent は置き場所で書き換わる
    restoreSubtree(d, 1, { parent: 5, page: "p2" }, null);
    expect(d.nodes.find(n => n.id === 1)).toEqual({ id: 1, caption: "A", parent: 5 });
    expect(problems(d)).toEqual([]);
  });
});

describe("pasteSubtree", () => {
  test("写したものに根が無ければ断る（データは変わらない）", () => {
    const d = book();
    const before = JSON.stringify(d);
    expect(() => pasteSubtree(d, { root: "9", nodes: [{ id: 1 }], edges: [] }, { page: null }, null)).toThrow("写した箱がありません: 9");
    expect(JSON.stringify(d)).toBe(before);
  });
  test("線の id は使っている番号を飛ばして小さい順に振る。配列の線の写しも id を持つ", () => {
    const d: Diagram = { nodes: [{ id: 1 }], edges: [{ id: "e1", from: 1, to: 1 }, { id: "e3", from: 1, to: 1 }] };
    const copy = { root: "1", nodes: [{ id: 1 }, { id: 2, parent: 1 }, { id: 3, parent: 1 }], edges: [{ from: 2, to: 3 }, { from: 3, to: 2 }] as EdgeData[] };
    const r = pasteSubtree(d, copy, { page: null }, null);
    expect(r).toEqual({ root: "2", nodes: 3, edges: 2 });
    expect((d.edges as EdgeData[]).slice(-2)).toEqual([{ id: "e2", from: 3, to: 4 }, { id: "e4", from: 4, to: 3 }]);
    expect(problems(d)).toEqual([]);
  });
  test("写したものはデータを共有しない（貼ったあと元を変えても変わらない）。最初のページの最上位なら page も位置も書かない", () => {
    const d: Diagram = { nodes: [] };
    const src: BoxData = { id: 1, caption: "元", link: "p2", clip: { x: 0, y: 0, w: 10, h: 10 }, x: 3, y: 4, page: "p9" };
    pasteSubtree(d, { root: "1", nodes: [src], edges: [] }, { page: null }, null);
    src.clip!.x = 5; // 元を変えても写しは変わらない（入れ子の値も写す）
    expect(d.nodes[0]).toEqual({ id: 1, caption: "元", link: "p2", clip: { x: 0, y: 0, w: 10, h: 10 }, userAdded: true });
  });
});

describe("applyClassEdit の項目ごとの扱い（class.test.ts の続き）", () => {
  const cls = (): Diagram => ({
    nodes: [{ id: 1, shape: "class", caption: "User", abstract: true, theme: "t", attrs: [{ name: "id" }], ops: [{ name: "save" }] }, { id: 2 }],
    edges: [[1, 2], { id: "e1", from: 1, to: 2, fromMember: "id" }],
  });
  test("渡さなかった項目は今のまま。abstract: false と空の行は項目ごと消す", () => {
    const d = cls();
    applyClassEdit(d, 1, { shape: "class" });
    expect(d.nodes[0]).toMatchObject({ abstract: true, theme: "t", attrs: [{ name: "id" }], ops: [{ name: "save" }] });
    applyClassEdit(d, 1, { shape: "class", abstract: false, ops: [{ name: "  " }] });
    expect(d.nodes[0]).not.toHaveProperty("abstract");
    expect(d.nodes[0]).not.toHaveProperty("ops");
    expect(d.nodes[0]!.attrs).toEqual([{ name: "id" }]);
  });
  test("キャプションは前後の空白を落とし、空白だけなら消す。theme は null で消し、undefined なら残す", () => {
    const d = cls();
    applyClassEdit(d, 1, { shape: "class", caption: "  Account ", theme: undefined });
    expect([d.nodes[0]!.caption, d.nodes[0]!.theme]).toEqual(["Account", "t"]);
    applyClassEdit(d, 1, { shape: "class", caption: "   ", theme: null });
    expect(d.nodes[0]).not.toHaveProperty("caption");
    expect(d.nodes[0]).not.toHaveProperty("theme");
  });
  test("配列で書いた線は配列のまま残る。行を全部消すと、行につながる線だけ消える", () => {
    const d = cls();
    expect(applyClassEdit(d, 1, { shape: "class", attrs: [] })).toEqual({ kids: 0, cut: 1 });
    expect(d.edges).toEqual([[1, 2]]);
  });
  test("ふつうの形（box）にすると shape を消す。線の端の行の名前は捨てて線は残す", () => {
    const d = cls();
    expect(applyClassEdit(d, 1, { shape: "box" })).toEqual({ kids: 0, cut: 0 });
    expect(d.nodes[0]).toEqual({ id: 1, caption: "User", theme: "t" });
    expect(d.edges).toEqual([[1, 2], { id: "e1", from: 1, to: 2 }]);
  });
  test("無い箱は断る", () => {
    expect(() => applyClassEdit(cls(), 9, { shape: "class" })).toThrow("ボックスがありません: 9");
  });
});
