package server

// アセットの口: 画面と AI から画像のバイト列を受けて置き場に入れ（アクションの外。返す id をページが page-create で指す）、画面に配る。
// 受けるのは中身で見分けた PNG・JPEG・GIF・WebP・SVG だけ。SVG は許す要素と属性の表で落としてから置く（svg_clean.go）。
// id は置く中身の sha256 なので、同じ画像は 1 つで、ほかのマシンでも同じ id。縮めない

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"regexp"
	"slices"
	"strconv"

	"github.com/umaxyon/matomezu/internal/aiwire"
	"github.com/umaxyon/matomezu/internal/storage"
)

// アセット 1 つの大きさの上限と、受けない理由（画面と AI に返す。名前空間を付けない土台の言葉。MCP と同じ値なので aiwire に置く）
const (
	maxAsset      = aiwire.MaxAsset
	assetTooLarge = aiwire.AssetTooLarge
	assetNotImage = aiwire.AssetNotImage
)

// assetIDPattern は、アセットの id の形（sha256 の 16 進）
var assetIDPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// assetInfo は、置いたアセットの id・種類・幅・高さ（画面と AI に返す）
type assetInfo struct {
	Asset  string `json:"asset"`
	Mime   string `json:"mime"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// refusedAsset は、受けなかった訳
type refusedAsset struct{ reason string }

func (r refusedAsset) Error() string { return r.reason }

// ImportAsset は、画像のバイト列 b を見分けて置き場に入れる（在れば同じ物を返す）。受けなければ refusedAsset
func (h *Hub) ImportAsset(b []byte) (assetInfo, error) {
	if len(b) > maxAsset {
		return assetInfo{}, refusedAsset{assetTooLarge}
	}
	a, ok := readImage(b)
	if !ok {
		return assetInfo{}, refusedAsset{assetNotImage}
	}
	sum := sha256.Sum256(a.Bytes)
	a.ID = hex.EncodeToString(sum[:])
	a.CreatedAt = stamp()
	if err := h.store.PutAsset(a); err != nil {
		return assetInfo{}, err
	}
	return assetInfo{a.ID, a.Mime, a.Width, a.Height}, nil
}

// Asset は id のアセット（無ければ nil）
func (h *Hub) Asset(id string) (*storage.Asset, error) {
	if !assetIDPattern.MatchString(id) {
		return nil, nil
	}
	return h.store.Asset(id)
}

// readImage は、b を中身で見分け、置く形（SVG は落とした後の物）と種類・幅・高さにする
func readImage(b []byte) (storage.Asset, bool) {
	switch {
	case bytes.HasPrefix(b, []byte("\x89PNG\r\n\x1a\n")):
		return rasterOf(b, "image/png")
	case bytes.HasPrefix(b, []byte("\xff\xd8\xff")):
		return rasterOf(b, "image/jpeg")
	case bytes.HasPrefix(b, []byte("GIF87a")), bytes.HasPrefix(b, []byte("GIF89a")):
		return rasterOf(b, "image/gif")
	case len(b) >= 12 && bytes.Equal(b[0:4], []byte("RIFF")) && bytes.Equal(b[8:12], []byte("WEBP")):
		w, h, ok := webpSize(b)
		return storage.Asset{Mime: "image/webp", Width: w, Height: h, Bytes: b}, ok
	}
	clean, w, h, ok := cleanSVG(b)
	if !ok {
		return storage.Asset{}, false
	}
	return storage.Asset{Mime: "image/svg+xml", Width: w, Height: h, Bytes: clean}, true
}

func rasterOf(b []byte, mime string) (storage.Asset, bool) {
	c, _, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil || c.Width <= 0 || c.Height <= 0 {
		return storage.Asset{}, false
	}
	return storage.Asset{Mime: mime, Width: c.Width, Height: c.Height, Bytes: b}, true
}

// webpSize は、WebP の幅と高さ（VP8・VP8L・VP8X の頭から読む）
func webpSize(b []byte) (int, int, bool) {
	if len(b) < 30 {
		return 0, 0, false
	}
	chunk, data := string(b[12:16]), b[20:]
	switch chunk {
	case "VP8 ":
		if len(data) < 10 || !bytes.Equal(data[3:6], []byte{0x9d, 0x01, 0x2a}) {
			return 0, 0, false
		}
		w := int(binary.LittleEndian.Uint16(data[6:8]) & 0x3fff)
		h := int(binary.LittleEndian.Uint16(data[8:10]) & 0x3fff)
		return w, h, w > 0 && h > 0
	case "VP8L":
		if len(data) < 5 || data[0] != 0x2f {
			return 0, 0, false
		}
		bits := binary.LittleEndian.Uint32(data[1:5])
		return int(bits&0x3fff) + 1, int((bits>>14)&0x3fff) + 1, true
	case "VP8X":
		if len(data) < 10 {
			return 0, 0, false
		}
		w := int(data[4]) | int(data[5])<<8 | int(data[6])<<16
		h := int(data[7]) | int(data[8])<<8 | int(data[9])<<16
		return w + 1, h + 1, true
	}
	return 0, 0, false
}

// importAsset は、本文の画像のバイト列を置き場に入れる口（画面の口と AI の口で同じ）。受けなければ ok false と訳を返す
func (o Options) importAsset(w http.ResponseWriter, r *http.Request) {
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxAsset+1))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeJSON(w, map[string]any{"ok": false, "reason": assetTooLarge})
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	info, err := o.Hub.ImportAsset(b)
	var refused refusedAsset
	if errors.As(err, &refused) {
		writeJSON(w, map[string]any{"ok": false, "reason": refused.reason})
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"ok": true, "asset": info.Asset, "mime": info.Mime, "width": info.Width, "height": info.Height})
}

// importAIAsset は、AI が画像を置く口（ワークルームに入った AI だけ。ビジターと参加が確定していない AI は、アクションと同じ理由で断る）
func (o Options) importAIAsset(w http.ResponseWriter, r *http.Request) {
	if reason, detail := o.Hub.assetRefusal(participantOf(r)); reason != "" {
		writeJSON(w, map[string]any{"ok": false, "reason": reason, "detail": detail})
		return
	}
	o.importAsset(w, r)
}

// serveAsset は、アセットの中身を配る口（中身は id で決まり変わらないので、ずっと使い回させる。SVG はスクリプトも外への読み込みも効かせない）
func (o Options) serveAsset(w http.ResponseWriter, r *http.Request) {
	a, err := o.Hub.Asset(r.PathValue("id"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if a == nil {
		http.NotFound(w, r)
		return
	}
	head := w.Header()
	head.Set("Content-Type", a.Mime)
	head.Set("Content-Length", strconv.Itoa(len(a.Bytes)))
	head.Set("Cache-Control", "private, max-age=31536000, immutable")
	head.Set("X-Content-Type-Options", "nosniff")
	head.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
	_, _ = w.Write(a.Bytes)
}

// dropUnusedAssets は、どのページ（ゴミ箱・読めない物のフォルダ・バックヤードの中も）からも指されないアセットを消す（起動したときに 1 度。h.mu を持って呼ぶ）。
// 数えきれないとき（読めない物のフォルダに物が在る・書庫を整えられていない・答えられないページが在る・エンジンが答えない）は消さない
func (h *Hub) dropUnusedAssets() {
	if h.unreadableWarning != "" || h.settleWarning != "" {
		return
	}
	bodies := make([]json.RawMessage, 0, len(h.pages))
	for _, p := range h.pages {
		bodies = append(bodies, p.body)
	}
	used, err := h.engine.AssetsInUse(bodies)
	if err != nil || !used.Sure {
		return
	}
	ids, err := h.store.AssetIDs()
	if err != nil {
		fmt.Fprintln(os.Stderr, "the assets cannot be read:", err)
		return
	}
	kept := map[string]bool{}
	for _, id := range used.IDs {
		kept[id] = true
	}
	unused := slices.DeleteFunc(ids, func(id string) bool { return kept[id] })
	if len(unused) == 0 {
		return
	}
	if err := h.store.RemoveAssets(unused); err != nil {
		fmt.Fprintln(os.Stderr, "the unused assets cannot be removed:", err)
	}
}
