// 通知のダイアログの順番待ち（app-notes.ts。D30・D38）。ほかのダイアログが開いていれば押しのけず、閉じたら届いた順に出す
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createNoteQueue } from "../web/src/app-notes";
import { closeEditDialog, openSimpleDialog } from "../web/src/edit-dialog";
import type { MailItem, MailNote } from "../web/src/mailbox";

const realFetch = globalThis.fetch;
let mail: MailItem[] = [];
let calls: string[] = [];
beforeEach(() => {
  mail = []; calls = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (method === "GET") return Response.json({ items: mail });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  closeEditDialog();
  document.body.innerHTML = "";
  document.body.classList.remove("touring");
});

const tick = () => new Promise(r => setTimeout(r, 5));
const note = (title: string, book: string | null = null): MailNote => ({ kind: "note", title, body: "", book, page: null });
const title = () => document.querySelector(".mz-dlg-overlay #mz-dlg-title")?.textContent ?? null;
const press = (sel: "[data-ok]" | "[data-cancel]") => document.querySelector<HTMLElement>(`.mz-dlg-overlay ${sel}`)!.click();

test("ダイアログが無ければすぐ出す。開いている間に届いた通知は待ち、閉じたら届いた順に出す", async () => {
  const queue = createNoteQueue();
  const opened: string[] = [];
  queue({ note: note("1 通目", "b"), into: null, sent: null, open: () => opened.push("1") });
  await tick();
  expect(title()).toBe("1 通目");
  queue({ note: note("2 通目"), into: null, sent: null, open: () => {} });
  queue({ note: note("3 通目"), into: null, sent: null, open: () => {} });
  await tick();
  expect(title()).toBe("1 通目"); // 押しのけない
  press("[data-ok]");
  expect(opened).toEqual(["1"]);
  await tick();
  expect(title()).toBe("2 通目");
  press("[data-ok]");
  await tick();
  expect(title()).toBe("3 通目");
});

test("編集のダイアログが開いていれば、その入力を失わないよう閉じるまで待つ", async () => {
  const queue = createNoteQueue();
  openSimpleDialog("編集中", "確定", "", () => {});
  queue({ note: note("通知"), into: null, sent: null, open: () => {} });
  await tick();
  expect(title()).toBe("編集中");
  press("[data-cancel]");
  await tick();
  expect(title()).toBe("通知");
});

test("説明ツアーの間は出さず、ツアーの幕が外れたら出す（D38）", async () => {
  const queue = createNoteQueue();
  document.body.classList.add("touring");
  const tour = document.createElement("div");
  tour.className = "mz-tour";
  document.body.appendChild(tour);
  queue({ note: note("通知"), into: null, sent: null, open: () => {} });
  await tick();
  expect(title()).toBeNull();
  document.body.classList.remove("touring");
  tour.remove();
  await tick();
  expect(title()).toBe("通知");
});

test("郵便箱に入れた通知: 出すときに中身を見せるので、開く動きがあれば既読、説明だけなら取り除く", async () => {
  const queue = createNoteQueue();
  mail = [{ id: "5", at: 1, read: false, body: note("開ける", "b") }, { id: "6", at: 1, read: false, body: note("説明") }];
  queue({ note: note("開ける", "b"), into: "a", sent: "5", open: () => {} });
  await tick();
  expect(calls).toContain("POST d/a/api/mail/5/read");
  press("[data-ok]"); // 開いたら取り除く
  expect(calls.at(-1)).toBe("DELETE d/a/api/mail/5");
  await tick();
  queue({ note: note("説明"), into: "a", sent: "6", open: () => {} });
  await tick();
  expect(calls).toContain("DELETE d/a/api/mail/6");
});

test("待っている間に郵便箱から見た（既読）・消した通知は出さず、次の通知へ進む", async () => {
  const queue = createNoteQueue();
  openSimpleDialog("編集中", "確定", "", () => {});
  mail = [{ id: "1", at: 1, read: true, body: note("見た") }];
  queue({ note: note("見た"), into: "a", sent: "1", open: () => {} });
  queue({ note: note("消した"), into: "a", sent: "2", open: () => {} }); // 郵便箱に無い
  queue({ note: note("残り"), into: null, sent: null, open: () => {} });
  press("[data-cancel]");
  await tick();
  await tick();
  expect(title()).toBe("残り");
});

test("show があれば通知のダイアログの代わりにそれを出し、郵便箱の行は既読にする（ツアーの開始の案内。D38）", async () => {
  const queue = createNoteQueue();
  mail = [{ id: "3", at: 1, read: false, body: note("ツアー") }];
  let shown = 0;
  queue({ note: note("ツアー"), into: "a", sent: "3", open: () => {}, show: () => { shown++; } });
  await tick();
  expect(shown).toBe(1);
  expect(title()).toBeNull();
  expect(calls).toContain("POST d/a/api/mail/3/read");
});
