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
	"Changes appear on the user's screen at once."

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
	{"place_item", "item.place", "Place an item on a page with its top-left at at (in paper pixels). It is refused if it does not fit on the paper. Returns the new item's id."},
	{"move_items", "item.move", "Move items of a page by (x, y) paper pixels. It is refused if any would leave the paper."},
	{"update_item", "item.update", "Change some props of an item. Props not given stay."},
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
}

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
		parts = append(parts, fmt.Sprintf("%s (%s, size %s) props %s", i.ID, i.Title, size, props))
	}
	return strings.Join(parts, "; ")
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
