// 説明ツアー（D38。matomezu tour。internal/server/tour.go。docs/TOUR-plan.md）の、画面の側の判断。2026-10-16 ユーザーと決めた決まり:
// - 開始の案内は郵便かダイアログ（notify と同じ。-mail なら郵便だけ）。「「{title}」の説明ツアーを開始してもいいですか？（n ステップ）」に
//   ［拒否］［キャンセル］［開始］。拒否は interrupt を返して終わり、キャンセルは郵便に残る（あとで開いて開始できる）
// - 案内を出す決まりはフォーカスと同じ: 手すきでなければ断る（busy）、フォーカスの反応待ちなら断る（pending）。段の箱が無ければ誤り
// - ツアー中は幕をかけてすべての操作を止める（tour-view.ts）。段はページもブックもまたぐ。倍率は今のまま、箱が収まらなければ収まる段まで下げる
// - × と Esc で「ツアーを終えますか？」（［開始前の場所に戻る］［ここに留まる］・キャンセルで続ける）。最後の段の［終わる］で complete を返し、
//   終了のダイアログ（［開始前の場所に戻る］［ここに留まる］）。ダイアログにごちゃごちゃ書かない
// - AI に返すのは complete / interrupt だけ（どの段まで見たかは返さない）
// - 段の箱が無くなった（AI の set で消えた）・AI が取り下げた（tour -end）ら、ツアーを止める
import { esc } from "./dom";
import { openSimpleDialog } from "./edit-dialog";
import type { Graph } from "./graph";
import { t } from "./i18n";
import { type MailNote, removeMail, sendMail } from "./mailbox";
import { pageOf } from "./pages";
import { EDIT_ZOOMS } from "./preview";
import { toast } from "./toast";
import { createTourView } from "./tour-view";
import type { Diagram } from "./types";

interface TourBook { id: string; loaded: boolean; data: unknown; graph: Graph; stage: HTMLElement }

interface TourStep { doc: string; box: string; say: string }
interface Tour { id: string; title: string; steps: TourStep[]; state: "waiting" | "running" | "complete" | "interrupt" }

export interface TourContext<B extends TourBook> {
  books(): B[];
  current(): { book: B; page: string | null } | null;
  openBook(id: string): Promise<B | null>;
  activate(b: B, page: string | null): void;
  title(b: B): string;
  busy(): boolean;         // ユーザーが手すきでない（app-point.ts と同じ決まり）
  focusWaiting(): boolean; // フォーカスの反応待ち（同時に出すのは 1 つ）
  setZoom(z: number): void; // 編集中の倍率（preview.ts の setEditZoom）
  queue(note: MailNote, into: string | null, sent: string | null, show: () => void): void; // 通知と同じ順番待ちでダイアログを出す（app-notes.ts）
}

const fetchTour = async (): Promise<Tour | null> => {
  try {
    const r = await fetch("api/tour", { cache: "no-store" });
    const v = r.ok ? await r.json() : null;
    return v && typeof v.id === "string" ? v as Tour : null;
  } catch { return null; }
};
const post = (id: string, state: string) => void fetch("api/tour/screen", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, state }),
}).catch(() => {});

export function createTourer<B extends TourBook>(ctx: TourContext<B>) {
  let running: { tour: Tour; index: number; view: ReturnType<typeof createTourView>; origin: Origin | null; asking: boolean } | null = null;
  interface Origin { book: B; page: string | null; left: number; top: number; zoom: number }

  const nodesOf = (b: B) => ((b.loaded ? b.graph.toJSON() : b.data) as Diagram | null)?.nodes ?? [];

  // 案内を出す（matomezu tour）。段の箱を確かめ、今見ているブックの郵便箱に入れて、-mail でなければダイアログも出す
  async function answer(req: string, id: string, mail: boolean) {
    const send = (state: string, error?: string) => void fetch(`api/point/${encodeURIComponent(req)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, error }),
    }).catch(() => {});
    if (running) return send("pending");
    if (ctx.busy()) return send("busy");
    if (ctx.focusWaiting()) return send("pending");
    const tour = await fetchTour();
    if (!tour || tour.id !== id) return send("error", "the tour is gone");
    for (const [i, s] of tour.steps.entries()) {
      const b = await ctx.openBook(s.doc);
      if (!b) return send("error", `step ${i + 1}: the diagram could not be opened in the browser`);
      if (!nodesOf(b).some(n => String(n.id) === s.box)) return send("error", `step ${i + 1}: no box ${s.box} in that diagram (removed boxes can't be shown)`);
    }
    const into = ctx.current()?.book.id ?? null;
    const note: MailNote = { kind: "note", title: t("説明ツアー: {title}", { title: tour.title }), body: "", book: null, page: null, tour: tour.id };
    const sent = into ? await sendMail(into, note) : null;
    if (!mail || !sent) ctx.queue(note, into, sent, () => void offer(tour.id, into, sent));
    send("offered");
  }

  // 開始の案内のダイアログ（届いたとき・郵便箱から開いたとき）
  async function offer(id: string, into: string | null, sent: string | null) {
    const tour = await fetchTour();
    const drop = () => { if (into && sent) void removeMail(into, sent); };
    if (!tour || tour.id !== id || tour.state !== "waiting" || running) {
      drop();
      if (!running) toast(t("このツアーはもう終わっています"));
      return;
    }
    openSimpleDialog(t("説明ツアー"), t("開始"),
      `<p class="mz-dlg-message">${esc(t("「{title}」の説明ツアーを開始してもいいですか？（{n} ステップ）", { title: tour.title, n: tour.steps.length }))}</p>`,
      () => { drop(); void begin(tour); },
      { extra: [{ label: t("拒否"), onClick: () => { drop(); post(tour.id, "interrupt"); } }] });
  }

  async function begin(tour: Tour) {
    const cur = ctx.current();
    const origin: Origin | null = cur ? { book: cur.book, page: cur.page, left: cur.book.stage.scrollLeft, top: cur.book.stage.scrollTop, zoom: cur.book.graph.zoom() } : null;
    const view = createTourView({
      prev: () => { if (running && running.index > 0) void go(running.index - 1); },
      next: () => { if (running) void (running.index < running.tour.steps.length - 1 ? go(running.index + 1) : finish()); },
      close: () => askEnd(),
      lost: () => stop(t("示す箱が無くなったので、ツアーを終えました")),
    });
    running = { tour, index: 0, view, origin, asking: false };
    post(tour.id, "running");
    await go(0);
  }

  // i 段目を出す: その箱のブック・ページへ移り、箱が収まらなければ倍率を下げて、真ん中に寄せる
  async function go(i: number) {
    const r = running;
    if (!r) return;
    const s = r.tour.steps[i]!;
    r.view.hold();
    const b = await ctx.openBook(s.doc);
    if (running !== r) return;
    if (!b || !nodesOf(b).some(n => String(n.id) === s.box)) return stop(t("示す箱が無くなったので、ツアーを終えました"));
    r.index = i;
    ctx.activate(b, pageOf(nodesOf(b), s.box));
    await new Promise(requestAnimationFrame);
    if (running !== r) return;
    const target = b.graph.tourTarget(s.box);
    if (!target) return stop(t("示す箱が無くなったので、ツアーを終えました"));
    const rect = target.el.getBoundingClientRect(), z = b.graph.zoom(), room = 0.8;
    const fits = (k: number) => rect.width * k / z <= b.stage.clientWidth * room && rect.height * k / z <= b.stage.clientHeight * room;
    if (!fits(z)) ctx.setZoom([...EDIT_ZOOMS].reverse().find(k => k < z && fits(k)) ?? EDIT_ZOOMS[0]!);
    b.graph.center(s.box);
    r.view.show({ find: () => b.graph.tourTarget(s.box)?.el ?? null, color: target.color, say: s.say, index: i, count: r.tour.steps.length });
  }

  // × と Esc: 終えるかを確かめる（キャンセルで続ける）
  function askEnd() {
    const r = running;
    if (!r || r.asking) return;
    r.asking = true;
    const overlay = openSimpleDialog(t("ツアーを終えますか？"), t("ここに留まる"), "", () => end(r, false),
      { extra: [{ label: t("開始前の場所に戻る"), onClick: () => end(r, true) }] });
    new MutationObserver((_, o) => { if (!overlay.isConnected) { o.disconnect(); r.asking = false; } }).observe(document.body, { childList: true });
  }

  function end(r: NonNullable<typeof running>, back: boolean) {
    if (running !== r) return;
    post(r.tour.id, "interrupt");
    close(r, back);
  }

  // 最後の段の［終わる］: complete を返し、戻るか留まるかを選ぶ
  function finish() {
    const r = running;
    if (!r) return;
    post(r.tour.id, "complete");
    close(r, false);
    openSimpleDialog(t("ツアーが終わりました"), t("ここに留まる"), "", () => {}, {
      cancel: false, extra: [{ label: t("開始前の場所に戻る"), onClick: () => restore(r.origin) }],
    });
  }

  function close(r: NonNullable<typeof running>, back: boolean) {
    r.view.destroy();
    running = null;
    if (back) restore(r.origin);
  }

  // 開始前の場所（ブック・ページ・倍率・スクロール）へ戻る
  function restore(o: Origin | null) {
    if (!o || !ctx.books().includes(o.book)) return;
    ctx.activate(o.book, o.page);
    ctx.setZoom(o.zoom);
    requestAnimationFrame(() => { o.book.stage.scrollLeft = o.left; o.book.stage.scrollTop = o.top; });
  }

  // 続けられなくなった（箱が消えた・取り下げられた）: その場で止める
  function stop(message: string) {
    const r = running;
    if (!r) return;
    post(r.tour.id, "interrupt");
    close(r, false);
    toast(message);
  }

  // サーバーのツアーが変わった（tourchanged）: 出しているツアーが取り下げられていたら止める
  async function refresh() {
    const r = running;
    if (!r) return;
    const tour = await fetchTour();
    if (running !== r || (tour && tour.id === r.tour.id && (tour.state === "waiting" || tour.state === "running"))) return;
    r.view.destroy();
    running = null;
    toast(t("AI がツアーを取り下げました"));
  }

  // 画面を読み直す・閉じるときは、出しているツアーを途中で終えたことにする（読み直したあとは続けられない）
  window.addEventListener("pagehide", () => {
    if (running) void fetch("api/tour/screen", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: running.tour.id, state: "interrupt" }) }).catch(() => {});
  });

  return { answer, offer, refresh, running: () => running != null };
}
