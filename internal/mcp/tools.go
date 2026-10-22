package mcp

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// instructions は、つないだ AI に渡す matomezu の説明
const instructions = "matomezu shows diagrams (books of pages with boxes) to the user in a browser. " +
	"Use view to see what the user is looking at, list_books and read_book to read, and the other tools to change books. " +
	"Changes appear at once on screens showing that book; use show to put a book on the user's screen."

// actionTool は、アクション 1 つを行う道具。受ける形は、そのアクションの引数（ブックが対象なら、それに book を足す）
type actionTool struct {
	name        string
	action      string
	description string
}

// actionTools は AI に渡すアクションの道具（並べたものだけを行える）
var actionTools = []actionTool{
	{"create_book", "book.create", "Create a book. type is a book type such as drawing. Returns the new book's id."},
	{"add_page", "page.add", "Add a page at the end of a book. Paper and orientation default to the book type's. Returns the new page's id."},
	{"place_item", "item.place", "Place an item on a page with its top-left at at (in paper pixels). w and h set the size of an item that can be resized (a box). " +
		"Without w, a box is as wide as its caption up to 20 characters (64 at the least); without h, tall enough to show up to 5 lines of its body. A box's body wraps to the width and what does not fit in the height is cut with …. " +
		"It is refused if it does not fit on the paper. Returns the new item's id."},
	{"move_items", "item.move", "Move items of a page by (x, y) paper pixels. It is refused if any would leave the paper."},
	{"update_item", "item.update", "Change some props of an item. Props not given stay; a prop given as null is removed (back to its default). The item's size does not change."},
	{"resize_item", "item.resize", "Change the size of an item that can be resized (a box): only w and h given change; x and y move its top-left too. " +
		"It is refused below the item's smallest size or off the paper."},
	{"remove_items", "item.remove", "Remove items from a page."},
}

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
			return api.Get("api/ai/books/" + id)
		},
	},
}

type catalogAction struct {
	ID     string         `json:"id"`
	Target string         `json:"target"`
	Args   map[string]any `json:"args"`
}

type catalog struct {
	Actions []catalogAction `json:"actions"`
	Items   []struct {
		ID    string         `json:"id"`
		Title string         `json:"title"`
		Size  map[string]any `json:"size"`
		Props map[string]any `json:"props"`
	} `json:"items"`
	Themes []struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	} `json:"themes"`
	Colors []struct {
		ID      string `json:"id"`
		Meaning string `json:"meaning"`
	} `json:"colors"`
}

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

func readCatalog(api API) (*catalog, error) {
	raw, err := api.Get("api/ai/catalog")
	if err != nil {
		return nil, err
	}
	var c catalog
	if err := json.Unmarshal(raw, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

// listTools は道具の一覧（読む道具と、目録にあるアクションの道具）
func listTools(api API) ([]map[string]any, error) {
	c, err := readCatalog(api)
	if err != nil {
		return nil, err
	}
	tools := []map[string]any{}
	for _, t := range readTools {
		tools = append(tools, map[string]any{"name": t.name, "description": t.description, "inputSchema": t.schema})
	}
	tools = append(tools, map[string]any{"name": "show", "description": showDescription, "inputSchema": showSchema})
	for _, t := range actionTools {
		i := slices.IndexFunc(c.Actions, func(a catalogAction) bool { return a.ID == t.action })
		if i < 0 {
			continue
		}
		a := c.Actions[i]
		description := t.description
		if t.action == "item.place" {
			description += " Items and their props: " + itemsText(c)
		}
		tools = append(tools, map[string]any{"name": t.name, "description": description, "inputSchema": inputSchema(a.Args, a.Target)})
	}
	return tools, nil
}

// inputSchema は、アクションの引数の形に、ブックが対象なら book を足したもの
func inputSchema(args map[string]any, target string) map[string]any {
	s := map[string]any{}
	for k, v := range args {
		if k != "$schema" {
			s[k] = v
		}
	}
	if target != "book" {
		return s
	}
	props := map[string]any{"book": map[string]any{"type": "string", "description": "The book's id."}}
	if p, ok := s["properties"].(map[string]any); ok {
		for k, v := range p {
			props[k] = v
		}
	}
	s["properties"] = props
	required := []any{"book"}
	if r, ok := s["required"].([]any); ok {
		required = append(required, r...)
	}
	s["required"] = required
	return s
}

func itemsText(c *catalog) string {
	parts := []string{}
	for _, i := range c.Items {
		props, _ := json.Marshal(i.Props["properties"])
		size, _ := json.Marshal(i.Size)
		parts = append(parts, fmt.Sprintf("%s (%s, default size %s) props %s", i.ID, i.Title, size, props))
	}
	themes := []string{}
	for _, th := range c.Themes {
		themes = append(themes, fmt.Sprintf("%s (%s)", th.ID, th.Title))
	}
	colors := []string{}
	for _, c := range c.Colors {
		colors = append(colors, fmt.Sprintf("%s (%s)", c.ID, c.Meaning))
	}
	return strings.Join(parts, "; ") + ". A box's theme prop takes one of the themes: " + strings.Join(themes, ", ") +
		" (without it, the box looks like its book's theme)" +
		". A box's color prop fills the box: one of the theme's colors by role, " + strings.Join(colors, ", ") +
		", drawn in the colors of the box's theme; or #rrggbb, the same in every theme (without it, the theme's fill)"
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
	for _, t := range actionTools {
		if t.name != name {
			continue
		}
		req := map[string]any{"action": t.action}
		if book, ok := args["book"].(string); ok {
			req["on"] = map[string]any{"book": book}
			delete(args, "book")
		}
		req["args"] = args
		out, err := api.Post("api/ai/perform", req)
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
	return "unknown tool: " + name, true
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
		return "bad-args: the arguments do not match the tool's input schema"
	case "not-allowed":
		return "not-allowed: this book's type does not allow it"
	default:
		return reason + ": it could not be done here (for example the page or item does not exist, or it would leave the paper; read_book to check)"
	}
}
