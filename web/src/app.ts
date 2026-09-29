/*
 * matomezu のサーバーから開いたときの画面。図をアプリ内のタブとして並べる（docs/TABS-plan.md）。
 * - タブ 1 つに図 1 つ。図ごとに描画領域・サイドバー・同期（sync.ts）を持つ。
 * - 見ていないタブは隠しておき、外部の変更は前に出たときに反映する（隠れた要素では文字の幅が測れないため）。
 *   Undo の履歴はタブごとに残る。
 * - ツールバー（Undo/Redo、モード）は、前に出ているタブの図に付け替える。
 * - サーバーの通知は events.ts の 1 本で受け、図ごとに配る。matomezu open で頼まれた図は、タブを開いて前に出す。
 * - 表示中の図は URL（?d=<id>）に、開いているタブの並びは localStorage に覚える（無くても動く）。
 */

import { connectEvents } from "./events";
import { createGraph, type Graph } from "./graph";
import { createPanel, type Panel } from "./panel";
import { docBase, fetchRemote, startSync, type Sync } from "./sync";
import { setupHistory, setupModes } from "./toolbar";

export interface AppUi {
  tabs: HTMLElement;
  canvas: HTMLElement;
  sidebar: HTMLElement;
  undo: HTMLButtonElement;
  redo: HTMLButtonElement;
  modeButtons: HTMLButtonElement[];
  modeLabel: HTMLElement;
  status(text: string): void;
  error(message: string): void;
  clearError(): void;
  hint(text: string): void;
}

interface Tab {
  id: string;
  name: string;
  button: HTMLElement;
  stage: HTMLElement;
  side: HTMLElement;
  graph: Graph;
  panel: Panel;
  sync: Sync;
  error: string | null;
}

const STORE_KEY = "matomezu.tabs";
const EMPTY_HINT = "開いている図がありません。LLM に matomezu open で開くよう頼んでください";

function loadSaved(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ids));
  } catch { /* 覚えられなくても動く */ }
}

export async function startApp(ui: AppUi) {
  const tabs: Tab[] = [];
  let current: Tab | null = null;
  let unbind: (() => void)[] = [];
  const opening = new Map<string, Promise<Tab | null>>(); // 読み込み中の図（同じ図を二重に開かない）

  function refreshButtons(t: Tab) {
    const h = t.graph.history();
    ui.undo.disabled = !h.canUndo;
    ui.redo.disabled = !h.canRedo;
  }

  function remember() {
    save(tabs.map(t => t.id));
  }

  function activate(t: Tab) {
    if (current === t) return;
    for (const u of unbind) u();
    unbind = [];
    for (const x of tabs) {
      const on = x === t;
      x.stage.hidden = !on;
      x.side.hidden = !on;
      x.button.setAttribute("aria-selected", String(on));
      if (!on) x.sync.setActive(false);
    }
    current = t;
    // 見えるようにしてから前に出す（配置は見えている要素で文字を測る）
    t.sync.setActive(true);
    unbind.push(setupHistory(t.graph, ui.undo, ui.redo), setupModes(t.graph, ui.modeButtons, ui.modeLabel));
    refreshButtons(t);
    if (t.error) ui.error(t.error);
    else ui.clearError();
    document.title = `${t.name} - matomezu`;
    try {
      const url = new URL(location.href);
      url.searchParams.set("d", t.id);
      history.replaceState(null, "", url);
    } catch { /* URL を変えられなくても動く */ }
  }

  function close(t: Tab) {
    const i = tabs.indexOf(t);
    if (i < 0) return;
    tabs.splice(i, 1);
    t.sync.close();
    t.graph.destroy();
    t.stage.remove();
    t.side.remove();
    t.button.remove();
    remember();
    if (current === t) {
      current = null;
      for (const u of unbind) u();
      unbind = [];
      const next = tabs[Math.min(i, tabs.length - 1)];
      if (next) activate(next);
      else empty();
    }
  }

  function empty() {
    document.title = "matomezu";
    ui.undo.disabled = ui.redo.disabled = true;
    ui.clearError();
    ui.hint(EMPTY_HINT);
  }

  function makeButton(t: Pick<Tab, "name">) {
    const b = document.createElement("div");
    b.className = "tab";
    b.setAttribute("role", "tab");
    const label = document.createElement("span");
    label.className = "tab-name";
    label.textContent = t.name;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "tab-close";
    x.title = "タブを閉じる";
    x.setAttribute("aria-label", "タブを閉じる");
    x.textContent = "×";
    b.append(label, x);
    return { b, x };
  }

  // 図を読み込んでタブを作る。知らない図（サーバーに登録されていない）なら null
  async function open(id: string): Promise<Tab | null> {
    const found = tabs.find(t => t.id === id);
    if (found) return found;
    const loading = opening.get(id);
    if (loading) return loading;
    const p = (async () => {
      const base = docBase(id);
      const remote = await fetchRemote(base);
      if (!remote) return null;
      const again = tabs.find(t => t.id === id);
      if (again) return again;

      const stage = document.createElement("div");
      stage.className = "stage";
      stage.hidden = true;
      ui.canvas.prepend(stage);
      const side = document.createElement("div");
      side.className = "side-pane";
      side.hidden = true;
      ui.sidebar.appendChild(side);
      const { b, x } = makeButton(remote);

      let panel: Panel | null = null;
      let sync: Sync | null = null;
      let t: Tab | null = null;
      const graph = createGraph(stage, { nodes: [] }, {
        onSelect: info => panel?.show(info),
        onChange: data => sync?.changed(data),
        onHistory: () => { if (t && current === t) refreshButtons(t); },
        onNotice: text => { if (t && current === t) ui.status(text); },
      });
      panel = createPanel(side, graph);
      // 図の上でボックスを押したら、その情報を見せる（削除モードでは押すと消えるので切り替えない）
      stage.addEventListener("pointerdown", e => {
        if (e.target instanceof Element && e.target.closest(".mz-head") && graph.mode() !== "remove") panel?.tab("info");
      });
      const tab: Tab = { id, name: remote.name, button: b, stage, side, graph, panel, sync: null as unknown as Sync, error: null };
      t = tab;
      sync = startSync(graph, base, remote, {
        status: text => { if (current === tab) ui.status(text); },
        error: message => { tab.error = message; if (current === tab) ui.error(message); },
        clearError: () => { tab.error = null; if (current === tab) ui.clearError(); },
      }, { active: false });
      tab.sync = sync;
      b.addEventListener("click", () => activate(tab));
      x.addEventListener("click", e => { e.stopPropagation(); close(tab); });
      ui.tabs.appendChild(b);
      tabs.push(tab);
      remember();
      return tab;
    })();
    opening.set(id, p);
    try {
      return await p;
    } finally {
      opening.delete(id);
    }
  }

  connectEvents({
    version(doc, v) {
      tabs.find(t => t.id === doc)?.sync.notify(v);
    },
    async open(doc) {
      const t = await open(doc);
      if (t) activate(t);
    },
    status: ui.status,
  });

  // 前に開いていたタブと、URL で指定された図を開く（サーバーが知らない図は開かない）
  const wanted = new URLSearchParams(location.search).get("d");
  const ids = [...new Set([...loadSaved(), ...(wanted ? [wanted] : [])])];
  const opened = (await Promise.all(ids.map(open))).filter((t): t is Tab => t != null);
  // 並びは覚えていた順にそろえる（読み込みの終わった順ではなく）
  for (const id of ids) {
    const t = tabs.find(x => x.id === id);
    if (t) ui.tabs.appendChild(t.button);
  }
  tabs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  remember();
  if (current) return; // 読み込みの間に open の知らせで前に出たものがある
  const first = opened.find(t => t.id === wanted) ?? tabs[0];
  if (first) activate(first);
  else empty();
}
