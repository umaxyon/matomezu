// events.ts のテスト。EventSource を偽物に置き換え、サーバーの通知と接続の切断を起こす
import { afterEach, beforeEach, expect, test } from "bun:test";
import { connectEvents } from "../web/src/events";

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
let stop: (() => void) | null = null;
let log: string[] = [];
let reloads = 0;

beforeEach(() => {
  sources = [];
  log = [];
  reloads = 0;
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  stop = connectEvents({
    version: (doc, v) => log.push(`version ${doc} ${v}`),
    open: (doc, page) => log.push(`open ${doc} ${page}`),
    status: () => {},
  }, { reload: () => { reloads++; }, retryDelay: 20 });
});

afterEach(() => {
  stop?.();
  globalThis.EventSource = realEventSource;
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
