// トースト: 画面の下の真ん中に、しばらく出て消える知らせ（2026-10-12 ユーザー: 断りの知らせがヘッダーの状態の文字では目立たない）。
// 何枚も重なれば下から順に積む。押すと消える。警告（warn）は目立つ色で長めに出す。
// エラー（error）は時間では消えない（保存できない・接続できないなど、直るまで出しておく。呼ぶ側が返り値の関数で消す。D26）。
//   toast(text, { kind: "warn" })
import { injectStyle } from "./dom";
import { t } from "./i18n";

const STYLE_ID = "matomezu-toast-style";
const CSS = `/* i18n-ok（CSS のコメント） */
.mz-toasts {
  position: fixed; left: 50%; bottom: 44px; z-index: 900; transform: translateX(-50%);
  display: flex; flex-direction: column-reverse; align-items: center; gap: 8px; pointer-events: none; max-width: min(560px, calc(100vw - 32px));
}
.mz-toast {
  --toast-bg: #2e2e34; --toast-fg: #f4f4f5; --toast-line: rgba(255, 255, 255, 0.14); --toast-accent: #8b6cf0;
  pointer-events: auto; box-sizing: border-box; display: flex; align-items: flex-start; gap: 10px; max-width: 100%;
  padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.5; cursor: pointer;
  color: var(--toast-fg); background: var(--toast-bg); border: 1px solid var(--toast-line); border-left: 4px solid var(--toast-accent);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  animation: mz-toast-in 0.18s ease-out;
}
.mz-toast.mz-toast-warn { --toast-accent: #f59e0b; }
.mz-toast.mz-toast-error { --toast-accent: #dc2626; }
.mz-toast.mz-toast-out { animation: mz-toast-out 0.18s ease-in forwards; }
.mz-toast-icon { flex: none; width: 18px; height: 18px; margin-top: 1px; border-radius: 50%; display: grid; place-items: center;
  font-size: 12px; font-weight: 700; color: #fff; background: var(--toast-accent); }
.mz-toast-text { white-space: pre-line; overflow-wrap: anywhere; }
@keyframes mz-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes mz-toast-out { to { opacity: 0; transform: translateY(6px); } }
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) .mz-toast { --toast-bg: #ffffff; --toast-fg: #1b1b1f; --toast-line: rgba(0, 0, 0, 0.12); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16); }
}
@media (prefers-reduced-motion: reduce) { .mz-toast, .mz-toast.mz-toast-out { animation: none; } }
`;

export type ToastKind = "info" | "warn" | "error";
export interface ToastOptions {
  kind?: ToastKind;
  duration?: number; // 出しておく時間（ms）。既定は info 3500 / warn 7000 / error は消えない（Infinity）
}
const DURATION: Record<ToastKind, number> = { info: 3500, warn: 7000, error: Infinity };

let host: HTMLElement | null = null;
function hostEl(): HTMLElement {
  if (host?.isConnected) return host;
  injectStyle(STYLE_ID, CSS);
  host = document.createElement("div");
  host.className = "mz-toasts";
  host.setAttribute("role", "status");
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  return host;
}

// 知らせを出す。消すための関数を返す（押しても、時間が来ても消える）
export function toast(text: string, o: ToastOptions = {}): () => void {
  const kind = o.kind ?? "info";
  const el = document.createElement("div");
  el.className = `mz-toast mz-toast-${kind}`;
  el.title = t("押すと閉じます");
  const icon = document.createElement("span");
  icon.className = "mz-toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = kind === "info" ? "i" : "!";
  const body = document.createElement("span");
  body.className = "mz-toast-text";
  body.textContent = text;
  el.append(icon, body);
  hostEl().appendChild(el);
  const duration = o.duration ?? DURATION[kind];
  let timer: ReturnType<typeof setTimeout> | null = Number.isFinite(duration) ? setTimeout(close, duration) : null;
  function close() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!el.isConnected) return;
    el.classList.add("mz-toast-out");
    // 消える動きのあとで取り除く（動きが無い環境でも消えるよう、時間でも取り除く）
    const remove = () => el.remove();
    el.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 250);
  }
  el.addEventListener("click", close);
  return close;
}

// 出ている知らせを全部消す（テストと、図を閉じるとき）
export function clearToasts(): void {
  host?.replaceChildren();
}
