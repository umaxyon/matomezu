// AI が一時的に箱を示すフォーカス枠の、画面の側の判断（D37。matomezu focus。internal/server/point.go）。2026-10-16 ユーザーと決めた決まり:
// - 一度に示すのは箱 1 つ。ユーザーが反応する（図を押す・Esc で枠を消す）までは、次のフォーカスを断る（pending）。
//   AI が待たずに次を示すと、ユーザーが前の箱を見られないため
// - ユーザーが手すきでない（ダイアログ・ドラッグ・文字の入力の最中）なら、何もせず断る（busy）
// - 今のブックの箱なら、そのページへ移って枠を出す（shown）。ほかのブックの箱なら、移るかを確かめるダイアログを出して答える（asked）。
//   ダイアログに答えるまでは反応待ちで、キャンセルも反応（断られたことは matomezu check に出す）
// - 待たずにすぐ答える（LLM の呼び出しを止めない。反応したかは check で分かる）
// - 郵便箱に入れたフォーカス（matomezu focus -mail）は、ユーザーが開いたときに示す。そのときは反応待ちでも新しい方に替える
// 枠そのもの（データ・選択・履歴に入れない）は graph.point（point-frame.ts）。
import { esc } from "./dom";
import { openSimpleDialog } from "./edit-dialog";
import type { BubbleHandlers } from "./ask-bubbles";
import type { Graph } from "./graph";
import { t } from "./i18n";
import { pageOf } from "./pages";
import type { Diagram } from "./types";

interface PointBook { id: string; loaded: boolean; data: unknown; graph: Graph }

export interface PointContext<B extends PointBook> {
  books(): B[];
  current(): { book: B; page: string | null } | null;
  openBook(id: string): Promise<B | null>;
  activate(b: B, page: string | null): void;
  title(b: B): string; // ブックの題名
}

const NO_BUBBLE: BubbleHandlers = { answer() {}, seen() {}, hide() {}, open() {} };

type State =
  | { phase: "shown"; doc: string; box: string }
  | { phase: "asking"; doc: string; box: string; cancel: () => void }
  | { phase: "declined"; doc: string; box: string }   // 移る確かめを断られた（次のフォーカスまで check に出す）
  | { phase: "responded"; doc: string; box: string }; // ユーザーが反応して枠が消えた（次のフォーカスまで check に出す。示していないのと区別するため）

export function createPointer<B extends PointBook>(ctx: PointContext<B>) {
  let state: State | null = null;

  // ユーザーがボタンを押しているか（ドラッグ。箱・線・タブ・リストの行、どれでも）
  let pressing = false;
  window.addEventListener("pointerdown", () => { pressing = true; }, true);
  for (const type of ["pointerup", "pointercancel"]) window.addEventListener(type, () => { pressing = false; }, true);
  window.addEventListener("blur", () => { pressing = false; });

  // 手すきでない: ダイアログが開いている・ドラッグの最中・文字を入力している（2026-10-16 ユーザー）
  function busy(): boolean {
    if (document.querySelector(".mz-dlg-overlay")) return true;
    if (pressing || ctx.books().some(b => b.loaded && b.graph.dragging())) return true;
    const a = document.activeElement;
    return !!a && a !== document.body && (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement || (a as HTMLElement).isContentEditable);
  }

  const nodesOf = (b: B) => ((b.loaded ? b.graph.toJSON() : b.data) as Diagram | null)?.nodes ?? [];

  // b の箱 box のページへ移って枠を出す。say があれば、枠と一緒に簡易メッセージの吹き出しを出す（D36。× か枠への反応で一緒に消える）
  function show(b: B, box: string, page: string | null, say = "") {
    ctx.activate(b, page);
    const s: State = { phase: "shown", doc: b.id, box };
    state = s;
    const react = () => {
      b.graph.askBubbles("focus", [], NO_BUBBLE);
      if (state === s) state = { phase: "responded", doc: b.id, box };
    };
    if (!b.graph.point(box, react)) { state = null; return; }
    if (say) b.graph.askBubbles("focus", [{ id: "say", box, text: say, view: "bubble", state: "open" }], { ...NO_BUBBLE, seen: () => { b.graph.point(null); react(); } });
  }

  // 枠だけを出す（focus -button。反応待ちは 1 問の話題が持つので、ここでは覚えない）
  function frame(b: B, box: string) {
    b.graph.point(box, () => {});
  }

  async function answer(req: string, doc: string | null, box: string | null, say = "") {
    const send = (state: string, error?: string) => void fetch(`api/point/${encodeURIComponent(req)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, error }),
    }).catch(() => {});
    if (doc == null || box == null) { // matomezu focus -clear
      if (state?.phase === "asking") state.cancel();
      for (const b of ctx.books()) if (b.loaded) { if (b.graph.pointed() != null) b.graph.point(null); b.graph.askBubbles("focus", [], NO_BUBBLE); }
      state = null;
      return send("cleared");
    }
    if (state?.phase === "shown" || state?.phase === "asking") return send("pending");
    if (busy()) return send("busy");
    const b = await ctx.openBook(doc);
    if (!b) return send("error", "the diagram could not be opened in the browser");
    const nodes = nodesOf(b);
    if (!nodes.some(n => String(n.id) === box)) return send("error", `no box ${box} in this diagram (removed boxes can't be shown)`);
    const page = pageOf(nodes, box);
    if (ctx.current()?.book === b) {
      show(b, box, page, say);
      return send("shown");
    }
    // ほかのブック: 移るかを確かめる。ダイアログに答えるまでは反応待ち
    const caption = String(nodes.find(n => String(n.id) === box)?.caption ?? box);
    let moved = false;
    const overlay = openSimpleDialog(t("AI が箱を示しています"), t("移動"),
      `<p class="mz-dlg-message">${esc(t("ブック「{book}」の「{box}」を示しています。移動しますか？", { book: ctx.title(b), box: caption }))}</p>`,
      () => { moved = true; show(b, box, page, say); });
    const s: State = { phase: "asking", doc, box, cancel: () => overlay.querySelector<HTMLElement>("[data-cancel]")?.click() };
    state = s;
    const watch = new MutationObserver(() => {
      if (overlay.isConnected) return;
      watch.disconnect();
      if (!moved && state === s) state = { phase: "declined", doc, box };
    });
    watch.observe(document.body, { childList: true, subtree: true });
    return send("asked");
  }

  // 郵便箱から開いた（matomezu focus -mail）: ユーザーが自分で開いたので、反応待ちでも新しい方に替えて示す
  async function fromMail(doc: string, box: string) {
    const b = await ctx.openBook(doc);
    if (!b) return;
    for (const x of ctx.books()) if (x !== b && x.loaded) x.graph.point(null);
    const nodes = nodesOf(b);
    if (!nodes.some(n => String(n.id) === box)) return ctx.activate(b, null);
    show(b, box, pageOf(nodes, box));
  }

  // matomezu check に添える 1 行（この図の箱を最後に示したときの様子。示していなければ ""）
  function status(doc: string): string {
    if (state?.doc !== doc) return "";
    switch (state.phase) {
      case "shown": return `focus: box ${state.box} is shown; the user has not responded yet`;
      case "asking": return `focus: asked the user whether to move to this diagram to see box ${state.box}; no answer yet`;
      case "declined": return `focus: the user declined to move to box ${state.box}`;
      case "responded": return `focus: the user responded to box ${state.box} (the frame is closed); you can focus again`;
    }
  }

  // フォーカスの反応待ち（ほかのブックへ移る確かめ中も）。AI の問いの話題を出さない（同時に追うのは 1 つ。D36）
  const waiting = () => state?.phase === "shown" || state?.phase === "asking";

  return { answer, fromMail, status, busy, waiting, frame };
}
