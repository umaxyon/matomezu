package mcp

import (
	"encoding/json"
	"net/url"
)

// instructions は、つないだ AI に渡す matomezu の説明
const instructions = "matomezu shows books (such as diagrams) to the user in a browser. " +
	"Use view to see what the user is looking at, list_books and read_book to read, actions to see what can be done, and perform to do it. " +
	"Changes appear at once on screens showing that book; use show to put a book on the user's screen."

type readTool struct {
	name        string
	description string
	schema      map[string]any
	call        func(api API, args map[string]any) (json.RawMessage, error)
}

var noArgs = map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": false}

var readTools = []readTool{
	{
		"view",
		"What the user is looking at now: the book, page and selected items of the matomezu window focused last. null when no window is open.",
		noArgs,
		func(api API, _ map[string]any) (json.RawMessage, error) { return api.Get("api/ai/view") },
	},
	{
		"list_books",
		"List the books: id, type, title and version. A book that cannot be read now (its book type is not installed, or it does not fit the type) has problem, the reason; it cannot be opened or changed until that is fixed. A book with items or settings of plugins that are not installed has warning; it can be read and changed, and those parts are kept as they are.",
		noArgs,
		func(api API, _ map[string]any) (json.RawMessage, error) { return api.Get("api/ai/books") },
	},
	{
		"read_book",
		"Read a whole book (its pages and the items on them) and its version.",
		map[string]any{
			"type":                 "object",
			"properties":           map[string]any{"book": map[string]any{"type": "string", "description": "The book's id."}},
			"required":             []string{"book"},
			"additionalProperties": false,
		},
		func(api API, args map[string]any) (json.RawMessage, error) {
			id, _ := args["book"].(string)
			return api.Get("api/ai/books/" + url.PathEscape(id)) // 1 冊だけのブックの id は / を含む
		},
	},
	{
		"read_settings",
		"Read the user's settings: lang, skin, keys (their changes to the shortcut keys) and textColors (their own text colors, by the text color's id). null when they have changed nothing.",
		noArgs,
		func(api API, _ map[string]any) (json.RawMessage, error) { return api.Get("api/ai/settings") },
	},
	{
		"actions",
		"List what can be done now (it changes when plugins are added or removed): the actions (id, target, title, description, and args as JSON Schema) to call with perform, " +
			"the book types (which can be created, whether they have pages and which items they place), the items (shape or connector) with their props and default sizes, the themes, the colors by role, the languages and the skins. " +
			"warnings (only when there are some) lists the problems that hold now, one line each with its code (W and 3 digits), found by the host or by the user's screens: " +
			"definitions that partly do not work, books that cannot be read, added plugins a screen could not set up (W011: their actions still work, but the user does not see what they draw).",
		noArgs,
		func(api API, _ map[string]any) (json.RawMessage, error) { return api.Get("api/ai/catalog") },
	},
}

// performSchema は perform の受ける形
var performSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"action": map[string]any{"type": "string", "description": "The action's id (see actions)."},
		"args":   map[string]any{"type": "object", "description": "The action's arguments, matching its args in actions."},
		"on": map[string]any{
			"type":                 "object",
			"description":          "The book the action is done on, for an action whose target is book.",
			"properties":           map[string]any{"book": map[string]any{"type": "string", "description": "The book's id."}},
			"required":             []string{"book"},
			"additionalProperties": false,
		},
	},
	"required":             []string{"action", "args"},
	"additionalProperties": false,
}

const performDescription = "Perform an action listed by actions, as the user would on the screen: the change appears at once on screens showing that book. " +
	"Returns the action's result (such as the id of what it made), or why it was refused."

// showSchema は show の受ける形
var showSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"book":  map[string]any{"type": "string", "description": "The book's id."},
		"page":  map[string]any{"type": "string", "description": "The page to show. Without it, the book opens as usual."},
		"stage": map[string]any{"type": "string", "description": "The id of the stage to show it on (see view). Without it, the current stage."},
		"split": map[string]any{"type": "boolean", "description": "Split that stage and show the book on the new stage at its right."},
	},
	"required":             []string{"book"},
	"additionalProperties": false,
}

const showDescription = "Show a book on the user's screen: in the matomezu window focused last, open it on a stage, which becomes current. " +
	"When no window is open, a browser opens matomezu first (this can take some seconds)."

// listTools は MCP 公開ツールの一覧（読む MCP 公開ツール・show・perform）。追加プラグインを足しても変わらない
func listTools() []map[string]any {
	tools := []map[string]any{}
	for _, t := range readTools {
		tools = append(tools, map[string]any{"name": t.name, "description": t.description, "inputSchema": t.schema})
	}
	tools = append(tools,
		map[string]any{"name": "show", "description": showDescription, "inputSchema": showSchema},
		map[string]any{"name": "perform", "description": performDescription, "inputSchema": performSchema},
	)
	return tools
}

// callTool は MCP 公開ツールを呼び、AI に返す文と、失敗したかを返す
func callTool(api API, name string, raw json.RawMessage) (string, bool) {
	args := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &args); err != nil {
			return "the arguments are not a JSON object", true
		}
	}
	for _, t := range readTools {
		if t.name == name {
			out, err := t.call(api, args)
			if err != nil {
				return err.Error(), true
			}
			return string(out), false
		}
	}
	if name == "show" {
		return show(api, args)
	}
	if name == "perform" {
		return perform(api, args)
	}
	return "unknown tool: " + name, true
}

func perform(api API, args map[string]any) (string, bool) {
	if _, ok := args["action"].(string); !ok {
		return "perform needs action (an action's id, see actions)", true
	}
	if _, ok := args["args"].(map[string]any); !ok {
		args["args"] = map[string]any{}
	}
	out, err := api.Post("api/ai/perform", args)
	if err != nil {
		return err.Error(), true
	}
	var done struct {
		OK     bool            `json:"ok"`
		Reason string          `json:"reason"`
		Detail string          `json:"detail"`
		Result json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(out, &done); err != nil {
		return string(out), true
	}
	if !done.OK {
		return refusalText(done.Reason, done.Detail), true
	}
	return string(done.Result), false
}

func show(api API, args map[string]any) (string, bool) {
	out, err := api.Post("api/ai/show", args)
	if err != nil {
		return err.Error(), true
	}
	var done struct {
		OK     bool   `json:"ok"`
		Opened bool   `json:"opened"`
		Reason string `json:"reason"`
		Detail string `json:"detail"`
		URL    string `json:"url"`
	}
	if err := json.Unmarshal(out, &done); err != nil {
		return string(out), true
	}
	switch {
	case done.OK && done.Opened:
		return "shown in a browser window opened for it", false
	case done.OK:
		return "shown", false
	case done.Reason == "no-browser":
		return "no-browser: could not open a browser (" + done.Detail + "); ask the user to open " + done.URL + " and call show again", true
	case done.Reason == "no-window":
		return "no-window: no matomezu window connected; ask the user to open " + done.URL + " and call show again", true
	case done.Reason == "no-stage":
		return "no-stage: the window has no stage with that id (see view)", true
	case done.Reason == "no-split":
		return "no-split: the window cannot split more; give the stage to show it on instead (see view)", true
	}
	return refusalText(done.Reason, done.Detail), true
}

// refusalText は断った理由の、AI に返す 1 行。detail は理由に添える値（読めないブックの warning など）
func refusalText(reason, detail string) string {
	switch reason {
	case "no-book":
		return "no-book: there is no book with that id (see list_books)"
	case "unreadable":
		return "unreadable: the book cannot be read now (" + detail + "); it cannot be changed until that is fixed (see list_books)"
	case "bad-args":
		return "bad-args: the args do not match the action's args (see actions)"
	case "not-allowed":
		return "not-allowed: this book's type (or, for the library and the settings, the home book's type) does not allow it"
	case "unknown":
		return "unknown: there is no action with that id (see actions)"
	case "locked":
		return "locked: the book or a page it would change is locked; only the user can unlock it, so ask the user in the chat"
	default:
		return reason + ": it could not be done here (for example the page or item does not exist, or the action's rules refuse it; read_book to check)"
	}
}
