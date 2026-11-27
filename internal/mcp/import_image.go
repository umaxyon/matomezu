package mcp

// import_image: 画像のバイト列を常駐のアセットに置く（AI の側のファイルを MCP のプロセスが読んで送るか、AI が書いた SVG の文を送る）。
// ページは作らない。置いたアセットの id を、AI が perform の page-create で画像のページに指させる

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

const importImageDescription = "Put an image in matomezu: path is a file on this machine (PNG, JPEG, GIF, WebP or SVG, up to 25MB), or svg is the text of an SVG you write (give one of them). " +
	"It answers asset (the image's id: the same image always has the same id), mime, width and height (in pixels). It makes no page: to show the image, " +
	"make an image page with perform: @matomezu/base:page-create with folder (the images folder, the system folder @matomezu/image:images, or a folder in it; see read_folder), type @matomezu/image:image, title and fields {asset, width, height} (as this answers them). " +
	"Image pages are only in the images folder and the folders in it. Only an AI that has joined a workroom can put images (refused with not-joined, and visitor for a visitor). An image no page points at is deleted when matomezu starts. " +
	"Refused with too-large (over 25MB) and not-image (not an image of those kinds; an SVG with scripts is kept without them, and one whose style loads from outside is refused)."

var importImageSchema = map[string]any{
	"type": "object",
	"properties": map[string]any{
		"path": map[string]any{"type": "string", "minLength": 1, "description": "The image file on this machine (an absolute path, or one from the directory this AI program runs in)."},
		"svg":  map[string]any{"type": "string", "minLength": 1, "description": "The text of an SVG (a document whose root is an svg element)."},
	},
	"additionalProperties": false,
}

func importImage(api caller, args map[string]any) (string, bool) {
	path, _ := args["path"].(string)
	svg, _ := args["svg"].(string)
	if (path == "") == (svg == "") {
		return "bad-args: give path or svg (one of them)", false
	}
	body := []byte(svg)
	if path != "" {
		b, refusal := readImageFile(path)
		if refusal != "" {
			return refusal, false
		}
		body = b
	}
	if len(body) > aiwire.MaxAsset {
		return tooLargeImage, false
	}
	out, err := api.Post("api/ai/assets", Bytes(body))
	if err != nil {
		return hostFailed(err)
	}
	var put struct {
		OK     bool   `json:"ok"`
		Reason string `json:"reason"`
		Detail string `json:"detail"`
		Asset  string `json:"asset"`
		Mime   string `json:"mime"`
		Width  int    `json:"width"`
		Height int    `json:"height"`
	}
	if err := json.Unmarshal(out, &put); err != nil {
		return "the matomezu server answered what is not an asset: " + string(out), true
	}
	switch {
	case put.OK:
		b, _ := json.Marshal(map[string]any{"asset": put.Asset, "mime": put.Mime, "width": put.Width, "height": put.Height})
		return string(b), false
	case put.Reason == aiwire.AssetTooLarge:
		return tooLargeImage, false
	case put.Reason == aiwire.AssetNotImage:
		return "not-image: it is not a PNG, JPEG, GIF, WebP or SVG image that can be read (an SVG whose style loads from outside is not taken either)", false
	}
	return refusalText(put.Reason, put.Detail), false
}

const tooLargeImage = "too-large: the image is larger than 25MB"

// readImageFile は、path のファイルの中身（上限を超えるか読めなければ、AI に返す断りの 1 行）
func readImageFile(path string) ([]byte, string) {
	f, err := os.Open(path)
	if err != nil {
		return nil, "cannot-read: " + err.Error()
	}
	defer f.Close()
	if st, err := f.Stat(); err != nil {
		return nil, "cannot-read: " + err.Error()
	} else if st.IsDir() {
		return nil, fmt.Sprintf("cannot-read: %s is a directory", path)
	} else if st.Size() > aiwire.MaxAsset {
		return nil, tooLargeImage
	}
	b, err := io.ReadAll(io.LimitReader(f, aiwire.MaxAsset+1))
	if err != nil {
		return nil, "cannot-read: " + err.Error()
	}
	return b, ""
}
