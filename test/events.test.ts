// events.ts のテスト。EventSource を偽物に置き換え、サーバーの通知と接続の切断を起こす
import { afterEach, beforeEach, expect, test } from "bun:test";
import { type EventConnection, connectEvents } from "../web/src/events";

let sources: FakeEventSource[] = [];

class FakeEventSource extends EventTarget {
  static CLOSED = 2;
  readyState = 1;
  constructor(public url: string) { super(); sources.push(this); }
  send(name: string, data: unknown) { this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) })); }
  // 再接続を諦めた
  fail() { this.readyState = FakeEventSource.CLOSED; this.dispatchEvent(new Event("error")); }
  close() { sources = sources.filter(s => s !== this); }
}

const realEventSource = globalThis.EventSource;
let conn: EventConnection | null = null;
let watched: string[] = [];
let posts: unknown[] = [];  // api/watch に送ったもの
let focuses: unknown[] = []; // api/focus に送ったもの（D30）
const realFetch = globalThis.fetch;
let log: string[] = [];
let reloads = 0;

beforeEach(() => {
  sources = [];
  log = [];
  reloads = 0;
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  watched = ["a"];
  posts = [];
  focuses = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    (url === "api/focus" ? focuses : posts).push(JSON.parse(String(init.body)));
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  conn = connectEvents({
    watched: () => watched,
    version: (doc, v) => log.push(`version ${doc} ${v}`),
    open: (doc, page) => log.push(`open ${doc} ${page}`),
    status: () => {},
  }, { reload: () => { reloads++; }, retryDelay: 20 });
});

afterEach(() => {
  conn?.close();
  globalThis.EventSource = realEventSource;
  globalThis.fetch = realFetch;
});

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

test("1 本の接続で、図ごとの版と開く知らせを配る", () => {
  expect(sources.length).toBe(1);
  sources[0]!.send("version", { doc: "a", version: "v1" });
  sources[0]!.send("version", { doc: "b", version: "v2" });
  sources[0]!.send("open", { doc: "b", page: "" });
  sources[0]!.send("open", { doc: "b", page: "7" });
  expect(log).toEqual(["version a v1", "version b v2", "open b null", "open b 7"]);
});

test("つなぎ直したサーバーの版が違えば画面を読み直す（同じなら読み直さない）", () => {
  sources[0]!.send("server", "s1");
  sources[0]!.send("server", "s1");
  expect(reloads).toBe(0);
  sources[0]!.send("server", "s2");
  expect(reloads).toBe(1);
});

test("接続を諦めたら、つなぎ直しを続ける", async () => {
  const first = sources[0]!;
  first.fail();
  expect(sources).toEqual([]);
  await wait(40);
  expect(sources.length).toBe(1);
  expect(sources[0]).not.toBe(first);
});

test("開いている図を、接続の id でサーバーに知らせる。変わったら知らせ直し、つなぎ直したら新しい id で知らせる", async () => {
  conn!.watchChanged(); // id が届く前は知らせない
  expect(posts).toEqual([]);
  sources[0]!.send("hello", { client: "c1" });
  watched = ["a", "b"];
  conn!.watchChanged();
  expect(posts).toEqual([{ client: "c1", docs: ["a"] }, { client: "c1", docs: ["a", "b"] }]);
  sources[0]!.fail();
  await wait(40);
  sources[sources.length - 1]!.send("hello", { client: "c2" });
  expect(posts.at(-1)).toEqual({ client: "c2", docs: ["a", "b"] });
});

test("フォーカスされたとき（前に出たとき）、接続の id で api/focus に知らせる。つないだときに前にあれば、そのときも知らせる（D30）", () => {
  const hasFocus = document.hasFocus;
  try {
    document.hasFocus = () => true;
    sources[0]!.send("hello", { client: "c1" });
    expect(focuses).toEqual([{ client: "c1" }]);
    window.dispatchEvent(new Event("focus"));
    expect(focuses).toEqual([{ client: "c1" }, { client: "c1" }]);
    // つなぎ直したら新しい id。前に無ければ、つないだだけでは知らせない
    document.hasFocus = () => false;
    sources[0]!.send("hello", { client: "c2" });
    expect(focuses.length).toBe(2);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(focuses.at(-1)).toEqual({ client: "c2" });
    // 閉じたら知らせない
    conn!.close();
    conn = null;
    window.dispatchEvent(new Event("focus"));
    expect(focuses.length).toBe(3);
  } finally {
    document.hasFocus = hasFocus;
  }
});
