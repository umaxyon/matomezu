package server

import "net/http"

// aiJoinRules は、クライアントの参加用 Skill が参加のたびに読む手順を返す。
func (o Options) aiJoinRules(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]string{"rules": joinRules})
}

const joinRules = `# Joining matomezu

1. Request to join from the conversation that the user asked to connect. Pass its model name if known or "unknown" otherwise. Pass the workroom only if the user named it or asked to continue a known workroom. Pass as: visitor only if the user asked you to join just to read (a visitor has no workroom, so leave the workroom out). Pass the session's name if known.
2. Call the matomezu MCP join tool once for the participation request, with a fresh UUID as link. Keep the UUID in the tool call so the client hook can find it. If asking again from the same conversation (after the user cancelled the request), reuse its link. For workroom-in-use or already-requested (your request is still waiting for the user's answer), tell the user and stop.
3. A successful request is awaiting approval unless participation has already been confirmed. Ask the user to approve it on the matomezu screen. If they need to open that screen, tell them to run matomezu open.`
