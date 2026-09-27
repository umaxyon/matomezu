import type { Diagram } from "./types";

const empty: Diagram = { nodes: [] };

const app = document.getElementById("app");
if (app) {
  app.textContent = `matomezu (nodes: ${empty.nodes.length})`;
}
