package server

import "net/http"

// aiJoinRules は、クライアントの参加用 Skill が参加のたびに読む手順を返す。
func (o Options) aiJoinRules(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]string{"rules": joinRules})
}

const joinRules = `# Joining matomezu

1. Request to join from the conversation that the user asked to connect. Pass its model name if known or "unknown" otherwise. Pass the workroom only if the user named it or asked to continue a known workroom. Pass the session's name if known.
2. If you have terminal access, you may include Orca information. When ORCA_CLI_COMMAND is set and identifies the configured Orca CLI, try its worktree current --json command in the current work directory. On success, pass the verified display name as orcaWorkspace (up to 120 characters). If Orca is unavailable or the name cannot be verified, omit the argument and continue.
3. Call the matomezu MCP join tool with a fresh UUID as link. Keep the UUID in the tool call so the client hook can find it. If retrying the same participation request from the same conversation, reuse its link. For workroom-in-use, tell the user and stop.
4. A successful request is awaiting approval unless participation has already been confirmed. Ask the user to approve it on the matomezu screen. If they need to open that screen, tell them to run matomezu start --open.`
