package server

// SVG の落とし方: 許す要素と属性の表に無い物を落として書き直す（スクリプト・イベントの属性・外への読み込み・foreignObject・アニメーションなど）。
// 指す先（href・url()）は、同じ文書の中（#…）だけを残す。DOCTYPE・処理命令・コメントは捨てる。根が svg の要素でなければ受けない

import (
	"bytes"
	"encoding/xml"
	"io"
	"math"
	"strconv"
	"strings"
)

const (
	svgSpace   = "http://www.w3.org/2000/svg"
	xlinkSpace = "http://www.w3.org/1999/xlink"
	xmlSpace   = "http://www.w3.org/XML/1998/namespace"
)

// svgElements は、残す要素（中の文字を残す物は true）
var svgElements = map[string]bool{
	"svg": false, "g": false, "defs": false, "symbol": false, "use": false, "title": true, "desc": true,
	"path": false, "rect": false, "circle": false, "ellipse": false, "line": false, "polyline": false, "polygon": false,
	"text": true, "tspan": true, "textPath": true,
	"linearGradient": false, "radialGradient": false, "stop": false, "pattern": false, "clipPath": false, "mask": false, "marker": false,
	"style":  true,
	"filter": false, "feGaussianBlur": false, "feOffset": false, "feBlend": false, "feColorMatrix": false, "feComposite": false,
	"feFlood": false, "feMerge": false, "feMergeNode": false, "feDropShadow": false, "feMorphology": false,
}

// svgAttributes は、残す属性（名前空間の無い物。xlink:href と xml:space は別に見る）
var svgAttributes = toSet(
	"id", "class", "style", "transform", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "fr",
	"width", "height", "d", "points", "pathLength", "viewBox", "preserveAspectRatio", "version", "href",
	"fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
	"stroke-dashoffset", "stroke-opacity", "stroke-miterlimit", "opacity", "color", "display", "visibility", "overflow",
	"vector-effect", "paint-order", "shape-rendering", "text-rendering", "mix-blend-mode", "isolation",
	"font-family", "font-size", "font-weight", "font-style", "font-variant", "text-anchor", "dominant-baseline",
	"alignment-baseline", "baseline-shift", "letter-spacing", "word-spacing", "text-decoration", "writing-mode",
	"dx", "dy", "rotate", "textLength", "lengthAdjust", "startOffset", "method", "spacing", "side",
	"offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod",
	"patternUnits", "patternContentUnits", "patternTransform", "clipPathUnits", "maskUnits", "maskContentUnits",
	"clip-path", "clip-rule", "mask", "marker-start", "marker-mid", "marker-end", "markerWidth", "markerHeight",
	"markerUnits", "refX", "refY", "orient", "filter", "filterUnits", "primitiveUnits", "in", "in2", "result",
	"stdDeviation", "mode", "operator", "k1", "k2", "k3", "k4", "values", "type", "flood-color", "flood-opacity", "radius",
)

func toSet(names ...string) map[string]bool {
	out := make(map[string]bool, len(names))
	for _, n := range names {
		out[n] = true
	}
	return out
}

// cleanSVG は、b を SVG として読み、落とした後の文書と幅・高さを返す（SVG として読めなければ ok false）
func cleanSVG(b []byte) ([]byte, int, int, bool) {
	d := xml.NewDecoder(bytes.NewReader(b))
	var out bytes.Buffer
	skip := 0          // 落とした要素の中にいる深さ
	open := []string{} // 開いている要素の名前
	w, h := 0, 0
	root := false
	for {
		tok, err := d.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, 0, 0, false
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if skip > 0 {
				skip++
				continue
			}
			_, allowed := svgElements[t.Name.Local]
			if !root {
				if t.Name.Space != svgSpace || t.Name.Local != "svg" {
					return nil, 0, 0, false
				}
				root = true
				w, h = svgSize(t.Attr)
			}
			if !allowed || t.Name.Space != svgSpace {
				skip = 1
				continue
			}
			writeSVGStart(&out, t, len(open) == 0)
			open = append(open, t.Name.Local)
		case xml.EndElement:
			if skip > 0 {
				skip--
				continue
			}
			if len(open) == 0 {
				return nil, 0, 0, false
			}
			open = open[:len(open)-1]
			out.WriteString("</" + t.Name.Local + ">")
		case xml.CharData:
			if skip > 0 || len(open) == 0 {
				continue
			}
			in := open[len(open)-1]
			if !svgElements[in] {
				continue
			}
			// style の中の CSS が外へ読みに行くなら、SVG ごと受けない（その規則だけを落とすと、見た目が黙って変わる）
			if in == "style" && !safeCSS(string(t)) {
				return nil, 0, 0, false
			}
			_ = xml.EscapeText(&out, t)
		}
	}
	if !root || len(open) != 0 {
		return nil, 0, 0, false
	}
	return out.Bytes(), w, h, true
}

// writeSVGStart は、要素の始まりを、残す属性だけで書く（根には名前空間を書く）
func writeSVGStart(out *bytes.Buffer, t xml.StartElement, root bool) {
	out.WriteString("<" + t.Name.Local)
	if root {
		out.WriteString(` xmlns="` + svgSpace + `" xmlns:xlink="` + xlinkSpace + `"`)
	}
	for _, a := range t.Attr {
		name, ok := attributeName(a.Name)
		if !ok || !safeValue(name, a.Value) {
			continue
		}
		out.WriteString(" " + name + `="`)
		_ = xml.EscapeText(out, []byte(a.Value))
		out.WriteString(`"`)
	}
	out.WriteString(">")
}

// attributeName は、残す属性の書く名前（残さなければ false）
func attributeName(n xml.Name) (string, bool) {
	switch n.Space {
	case "":
		return n.Local, svgAttributes[n.Local]
	case xlinkSpace:
		return "xlink:href", n.Local == "href"
	case xmlSpace, "xml":
		return "xml:space", n.Local == "space"
	}
	return "", false
}

// safeValue は、属性の値が外を指さないか（href は #… だけ、ほかは url(#…) のほかの url() を持たない）
func safeValue(name, v string) bool {
	if name == "href" || name == "xlink:href" {
		return strings.HasPrefix(strings.TrimSpace(v), "#")
	}
	return safeCSS(v)
}

// safeCSS は、値（style の中も）が、文書の外へ読みに行かないか
func safeCSS(v string) bool {
	low := strings.ToLower(v)
	if strings.Contains(low, "@import") || strings.Contains(low, "expression(") || strings.Contains(low, "javascript:") {
		return false
	}
	for i := strings.Index(low, "url("); i >= 0; i = strings.Index(low, "url(") {
		rest := strings.TrimLeft(low[i+4:], " \t\n\r'\"")
		if !strings.HasPrefix(rest, "#") {
			return false
		}
		low = low[i+4:]
	}
	return true
}

// svgSize は、根の幅と高さ（width・height を px で読み、無ければ viewBox、それも無ければ 300×150）
func svgSize(attrs []xml.Attr) (int, int) {
	get := func(name string) string {
		for _, a := range attrs {
			if a.Name.Space == "" && a.Name.Local == name {
				return strings.TrimSpace(a.Value)
			}
		}
		return ""
	}
	box := strings.Fields(strings.ReplaceAll(get("viewBox"), ",", " "))
	bw, bh := 0.0, 0.0
	if len(box) == 4 {
		bw, _ = strconv.ParseFloat(box[2], 64)
		bh, _ = strconv.ParseFloat(box[3], 64)
	}
	w, wok := pixels(get("width"))
	h, hok := pixels(get("height"))
	switch {
	case wok && hok:
	case wok && bw > 0 && bh > 0:
		h = w * bh / bw
	case hok && bw > 0 && bh > 0:
		w = h * bw / bh
	case bw > 0 && bh > 0:
		w, h = bw, bh
	default:
		w, h = 300, 150
	}
	return max(1, int(math.Round(w))), max(1, int(math.Round(h)))
}

// pixels は、長さを px で読む（単位の無い数と px だけ。% などは読まない）
func pixels(v string) (float64, bool) {
	v = strings.TrimSuffix(v, "px")
	f, err := strconv.ParseFloat(v, 64)
	return f, err == nil && f > 0
}
