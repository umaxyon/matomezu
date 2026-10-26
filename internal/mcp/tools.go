package mcp

import (
	"encoding/json"
	"net/url"
)

// instructions は、つないだ AI に渡す matomezu の説明
const instructions = "matomezu shows diagrams (books of pages with boxes) to the user in a browser. " +
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
		"List the books: id, type, title and version.",
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
		"Read the user's settings: lang, skin and keys (their changes to the shortcut keys). null when they have changed nothing.",
		noArgs,
		func(api API, _ map[string]any) (json.RawMessage, error) { return api.Get("api/ai/settings") },
	},
	{
		"actions",
		"List what can be done now (it changes when plugins are added or removed): the actions (id, target, title, description, and args as JSON Schema) to call with perform, " +
			"the book types (which can be created, whether they have pages and which items they place), the items (shape or connector) with their props and default sizes, the themes, the colors by role, the languages and the skins.",
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
		"page":  map[string]any{"type": "string", "description": "The page to show. Without it, the book opens as usual (a drawing at its first page)."},
		"stage": map[string]any{"type": "string", "description": "The id of the stage to show it on (see view). Without it, the current stage."},
		"split": map[string]any{"type": "boolean", "description": "Split that stage and show the book on the new stage at its right."},
	},
	"required":             []string{"book"},
	"additionalProperties": false,
}

const showDescription = "Show a book on the user's screen: in the matomezu window focused last, open it on a stage, which becomes current. " +
	"When no window is open, a browser opens matomezu first (this can take some seconds)."

// listTools は道具の一覧（読む道具・show・perform）。追加プラグインを足しても変わらない
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

// callTool は道具を呼び、AI に返す文と、失敗したかを返す
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
		Result json.RawMessage `json:"result"`
	}
	if err := json.Unmarshal(out, &done); err != nil {
		return string(out), true
	}
	if !done.OK {
		return refusalText(done.Reason), true
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
	return refusalText(done.Reason), true
}

func refusalText(reason string) string {
	switch reason {
	case "no-book":
		return "no-book: there is no book with that id (see list_books)"
	case "bad-args":
		return "bad-args: the args do not match the action's args (see actions)"
	case "not-allowed":
		return "not-allowed: this book's type (or, for the library and the settings, the home book's type) does not allow it"
	case "unknown":
		return "unknown: there is no action with that id (see actions)"
	default:
		return reason + ": it could not be done here (for example the page or item does not exist, or it would leave the paper; read_book to check)"
	}
}
