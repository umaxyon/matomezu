---
name: join
description: Request to join a matomezu workroom from the current Claude Code conversation when the user asks to join or continue a workroom.
---

1. Call the matomezu MCP tool `join_rules`. If it is unavailable or the call fails, report the failure and stop. If matomezu was just updated, tell the user to restart matomezu and reconnect the MCP.
2. Follow the returned rules to submit one `join` request from this conversation.
3. When approval is pending, tell the user how to approve the request on the matomezu screen, then end the turn.
