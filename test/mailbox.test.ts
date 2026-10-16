// 郵便箱（mailbox.ts。D26 の段階 3）
import { afterEach, beforeEach, expect, test } from "bun:test";
import { closeEditDialog } from "../web/src/edit-dialog";
import { COPY_MIME } from "../web/src/graph";
import { type MailItem, type MailNote, arrivedNote, badgeText, createMailbox, fetchMail, sendMail } from "../web/src/mailbox";

test("未読の数の印は 0 なら出さず、99 を超えたら 99+", () => {
  expect([badgeText(0), badgeText(1), badgeText(99), badgeText(100), badgeText(120)]).toEqual(["", "1", "99", "99+", "99+"]);
});

// ---- 偽のサーバー（d/<doc>/api/mail） ----
const realFetch = globalThis.fetch;
let mail: Record<string, MailItem[]> = {};
let calls: string[] = []; // "GET d/a/api/mail" のような、届いた頼み
let failGet = false;
let nextId = 10;
let delay: Record<string, number> = {}; // ブックごとに、郵便箱の答えを遅らせる時間
beforeEach(() => {
  mail = {}; calls = []; failGet = false; nextId = 10; delay = {};
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    const doc = decodeURIComponent(url.split("/")[1]!);
    if (method === "GET") {
      if (delay[doc]) await new Promise(r => setTimeout(r, delay[doc]));
      if (failGet) return new Response("no", { status: 500 });
      return Response.json({ items: mail[doc] ?? [] });
    }
    if (method === "POST" && url.endsWith("/api/mail")) return Response.json({ id: nextId++ });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  closeEditDialog();
  document.body.innerHTML = "";
});

const tick = () => new Promise(r => setTimeout(r, 0));
const note = (o: Partial<MailNote> = {}): MailNote => ({ kind: "note", title: "お知らせ", body: "本文", book: null, page: null, ...o });
const item = (id: string, body: MailItem["body"], read = false): MailItem => ({ id, at: 1, read, body });
const dialog = () => document.querySelector<HTMLElement>(".mz-dlg-overlay");

test("fetchMail は知らない種類の行を捨て、以前の「ブック」の行は「届いています」の通知に直す", async () => {
  mail.a = [
    item("1", note()),
    { id: "2", at: 1, read: false, body: { kind: "book", book: "b", page: "7", name: "設計" } } as unknown as MailItem,
    { id: "3", at: 1, read: false, body: { kind: "unknown" } } as unknown as MailItem,
    { id: "4", at: 1, read: false } as unknown as MailItem,
  ];
  const got = await fetchMail("a");
  expect(got.map(i => i.id)).toEqual(["1", "2"]);
  expect(got[1]!.body).toEqual(arrivedNote("b", "7", "設計"));
});

test("fetchMail は読めない（サーバーの誤り・つながらない・形が違う）ときは空にする", async () => {
  failGet = true;
  expect(await fetchMail("a")).toEqual([]);
  globalThis.fetch = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
  expect(await fetchMail("a")).toEqual([]);
  globalThis.fetch = (async () => Response.json({ items: "x" })) as unknown as typeof fetch;
  expect(await fetchMail("a")).toEqual([]);
});

test("sendMail は届けた行の id を返し、届けられなければ null", async () => {
  expect(await sendMail("a b", note())).toBe("10");
  expect(calls.at(-1)).toBe("POST d/a%20b/api/mail");
  globalThis.fetch = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
  expect(await sendMail("a", note())).toBeNull();
});

function setup(o: { openTour?: boolean } = {}) {
  const pane = document.createElement("div");
  document.body.appendChild(pane);
  const opened: MailNote[] = [], tours: string[] = [], counts: number[] = [];
  const box = createMailbox(pane, {
    openBook: n => opened.push(n),
    openTour: o.openTour === false ? undefined : (tour, doc, id) => tours.push(`${tour} ${doc} ${id}`),
    onCount: n => counts.push(n),
  });
  return { pane, box, opened, tours, counts };
}
const rows = (pane: HTMLElement) => [...pane.querySelectorAll<HTMLElement>(".mz-mail-row")];

test("ブックの郵便箱を出すと、行を並べて未読の数を知らせる。未読は太字の印、種類の札（ツアー・ブック・お知らせ・パターン）を付ける", async () => {
  mail.a = [
    item("1", note({ title: "説明" })),
    item("2", note({ title: "届いた", book: "b", name: "設計" }), true),
    item("3", note({ title: "ツアー", tour: "t1" })),
    item("4", { kind: "box", from: "別のブック", pattern: "tree", caption: "箱", copy: { nodes: [] } }),
  ];
  const { pane, box, counts } = setup();
  box.show("a");
  await tick();
  expect(rows(pane).map(r => r.querySelector(".mz-mail-chip")!.textContent)).toEqual(["お知らせ", "ブック", "ツアー", "ツリー"]);
  expect(rows(pane).map(r => r.classList.contains("mz-unread"))).toEqual([true, false, true, true]);
  expect(rows(pane)[1]!.querySelector(".mz-mail-cap")!.textContent).toBe("届いた（設計）");
  expect(rows(pane)[3]!.getAttribute("draggable")).toBe("true");
  expect(counts.at(-1)).toBe(3);
  expect(box.doc()).toBe("a");
});

test("空なら「届いている物はありません」。null で隠すと数は 0 にして、読みに行かない", async () => {
  const { pane, box, counts } = setup();
  box.show("a");
  await tick();
  expect(pane.querySelector(".mz-mail-empty")).not.toBeNull();
  calls = [];
  box.show(null);
  await tick();
  expect(calls).toEqual([]);
  expect(counts.at(-1)).toBe(0);
});

test("読んでいる間に別のブックへ切り替えたら、前のブックの結果で描かない", async () => {
  mail.a = [item("1", note({ title: "A の知らせ" }))];
  mail.b = [item("2", note({ title: "B の知らせ" }))];
  delay.a = 20; // a の答えは b より後に届く
  const { pane, box } = setup();
  box.show("a");
  box.show("b"); // a の答えが届く前に切り替えた
  await new Promise(r => setTimeout(r, 40));
  expect(rows(pane).map(r => r.querySelector(".mz-mail-cap")!.textContent)).toEqual(["B の知らせ"]);
});

test("× を押すとその行をサーバーから消す（行を開かない）", async () => {
  mail.a = [item("1", note({ book: "b" }))];
  const { pane, box } = setup();
  box.show("a");
  await tick();
  calls = [];
  pane.querySelector<HTMLElement>("[data-del]")!.click();
  expect(calls).toEqual(["DELETE d/a/api/mail/1"]);
  expect(dialog()).toBeNull();
});

test("説明だけの通知は、押すとダイアログで中身を見せ、見たので取り除く（「閉じる」だけ）", async () => {
  mail.a = [item("1", note({ title: "題", body: "<b>本文</b>" }))];
  const { pane, box, opened } = setup();
  box.show("a");
  await tick();
  calls = [];
  rows(pane)[0]!.click();
  expect(calls).toEqual(["DELETE d/a/api/mail/1"]);
  expect(dialog()!.querySelector(".mz-note-body")!.textContent).toBe("<b>本文</b>"); // 文字として出す
  expect(dialog()!.querySelector("[data-cancel]")).toBeNull();
  dialog()!.querySelector<HTMLElement>("[data-ok]")!.click();
  expect(opened).toEqual([]);
});

test("開く動きのある通知は、押すと既読にして「開く / キャンセル」。キャンセルなら残し、開くなら取り除いてブックを開く", async () => {
  const n = note({ book: "b", page: "7" });
  mail.a = [item("1", n)];
  const { pane, box, opened } = setup();
  box.show("a");
  await tick();
  calls = [];
  rows(pane)[0]!.click();
  expect(calls).toEqual(["POST d/a/api/mail/1/read"]);
  dialog()!.querySelector<HTMLElement>("[data-cancel]")!.click();
  expect(calls.length).toBe(1);
  expect(opened).toEqual([]);
  rows(pane)[0]!.click();
  dialog()!.querySelector<HTMLElement>("[data-ok]")!.click();
  expect(calls.at(-1)).toBe("DELETE d/a/api/mail/1");
  expect(opened).toEqual([n]);
});

test("既読の「開く動きのある通知」を押しても、もう一度は既読を送らない", async () => {
  mail.a = [item("1", note({ book: "b" }), true)];
  const { pane, box } = setup();
  box.show("a");
  await tick();
  calls = [];
  rows(pane)[0]!.click();
  expect(calls).toEqual([]);
  expect(dialog()).not.toBeNull();
});

test("ツアーの案内は、押すと既読にしてツアーの開始の案内に渡す（郵便箱の通知のダイアログは出さない）", async () => {
  mail.a = [item("1", note({ tour: "t1" })), item("2", note({ tour: "t2" }), true)];
  const { pane, box, tours } = setup();
  box.show("a");
  await tick();
  calls = [];
  rows(pane)[0]!.click();
  rows(pane)[1]!.click();
  expect(calls).toEqual(["POST d/a/api/mail/1/read"]);
  expect(tours).toEqual(["t1 a 1", "t2 a 2"]);
  expect(dialog()).toBeNull();
});

test("箱の行をドラッグすると移植の写しを持ち、図に置けたら（pasted）その行を取り除く。置けずに終われば残す", async () => {
  const copy = { nodes: [{ id: 1, caption: "箱" }] };
  mail.a = [item("1", { kind: "box", from: "別", pattern: "nest", caption: "箱", copy })];
  const { pane, box } = setup();
  box.show("a");
  await tick();
  const data = new Map<string, string>();
  const dt = { setData: (k: string, v: string) => data.set(k, v), effectAllowed: "" } as unknown as DataTransfer;
  const drag = (type: string) => {
    const e = new Event(type, { bubbles: true });
    Object.defineProperty(e, "dataTransfer", { value: dt });
    rows(pane)[0]!.dispatchEvent(e);
  };
  calls = [];
  // 置けずに終わった
  drag("dragstart");
  drag("dragend");
  await tick();
  box.pasted();
  expect(calls).toEqual([]);
  // 置けた
  drag("dragstart");
  expect(JSON.parse(data.get(COPY_MIME)!)).toEqual({ copy, from: "別" });
  box.pasted();
  expect(calls).toEqual(["DELETE d/a/api/mail/1"]);
  box.pasted(); // 2 回目は何もしない
  expect(calls.length).toBe(1);
});
