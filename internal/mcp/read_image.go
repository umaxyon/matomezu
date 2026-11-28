package mcp

// read_image: 画像のページの画像を AI に見せる（頼んだときだけ。重いので read_page には付けない）。
// 常駐が AI の読める大きさに縮めた画像を、文（大きさ）のあとに画像で渡す。SVG は文字で渡す

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

const readImageDescription = "See the image of an image page (page: its id; image pages are in the images folder, the system folder @matomezu/image:images; see read_folder or read_book). " +
	"Use it only when you need to see what the image shows (such as to read its text or draw it as shapes): an image is heavy, and read_page already tells its size and title. " +
	"It answers width and height (the image's own size in pixels) and sent (the size of the image given here, smaller when it is large), then the image itself; an SVG is given as its text instead (svg), with no image. " +
	"Refused with no-page (no such page you can read), no-image (the page shows no image), too-large (too large to open, or an SVG over 60000 characters) and cannot-read (the image cannot be opened to make it smaller)."

var readImageSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"page": map[string]any{"type": "string", "minLength": 1, "description": "The image page's id."},
	},
	"required":             []string{"page"},
	"additionalProperties": false,
}

// imageBlock は、MCP の答えの文のあとに足す画像（data は base64）
type imageBlock struct {
	data string
	mime string
}

func readImage(c *conn, args map[string]any) (string, bool) {
	page, _ := args["page"].(string)
	out, err := c.Get("api/ai/pages/" + url.PathEscape(page) + "/image")
	if err != nil {
		var h *HostError
		if errors.As(err, &h) && h.Code == http.StatusNotFound {
			return "no-page: there is no page " + page + " you can read", false
		}
		return hostFailed(err)
	}
	var got struct {
		OK         bool   `json:"ok"`
		Reason     string `json:"reason"`
		Mime       string `json:"mime"`
		Width      int    `json:"width"`
		Height     int    `json:"height"`
		SentWidth  int    `json:"sentWidth"`
		SentHeight int    `json:"sentHeight"`
		Data       string `json:"data"`
		SVG        string `json:"svg"`
	}
	if err := json.Unmarshal(out, &got); err != nil {
		return "the matomezu server answered what is not an image: " + string(out), true
	}
	if !got.OK {
		switch got.Reason {
		case "no-image":
			return "no-image: the page shows no image", false
		case "unsure", "no-asset":
			return "no-image: the page's image cannot be found", false
		case "too-large":
			return "too-large: the image is too large to open (or the SVG is over 60000 characters)", false
		case "cannot-read":
			return "cannot-read: the image cannot be opened to make it smaller", false
		}
		return got.Reason, false
	}
	if got.SVG != "" {
		var b strings.Builder
		enc := json.NewEncoder(&b)
		enc.SetEscapeHTML(false)
		_ = enc.Encode(map[string]any{"mime": got.Mime, "width": got.Width, "height": got.Height, "svg": got.SVG})
		return strings.TrimSuffix(b.String(), "\n"), false
	}
	c.image = &imageBlock{data: got.Data, mime: got.Mime}
	return fmt.Sprintf(`{"mime":%q,"width":%d,"height":%d,"sent":{"width":%d,"height":%d}}`, got.Mime, got.Width, got.Height, got.SentWidth, got.SentHeight), false
}
