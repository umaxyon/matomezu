package mcp

import (
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"strings"
)

// schemaKeywords は、MCP 公開ツールの inputSchema に書いてよいキーワード。checkArguments はこれだけを確かめる（ほかを書くと Go のテストで落ちる）
var schemaKeywords = []string{"type", "description", "properties", "required", "additionalProperties", "enum", "minimum", "maximum", "minLength", "maxLength", "items", "minItems", "maxItems", "anyOf"}

// checkArguments は、MCP 公開ツール tool に届いた引数を、その MCP 公開ツールの inputSchema で確かめ、合わない所を 1 つずつ文にして返す（合えば空）
func checkArguments(tool string, schema map[string]any, args map[string]any) []string {
	return checkValue(tool, schema, args, "")
}

// checkValue は v を schema で確かめる。at は引数の中の位置（一番上は空。on.book・kinds[0].kind のように書く）
func checkValue(tool string, schema map[string]any, v any, at string) []string {
	if alts, ok := schema["anyOf"].([]any); ok {
		for _, alt := range alts {
			if len(checkValue(tool, alt.(map[string]any), v, at)) == 0 {
				return nil
			}
		}
		names := []string{}
		for _, alt := range alts {
			names = append(names, describe(alt.(map[string]any)))
		}
		return []string{fmt.Sprintf("%s must be %s or %s", at, strings.Join(names[:len(names)-1], ", "), names[len(names)-1])}
	}
	if typ, ok := schema["type"].(string); ok && !isType(typ, v) {
		return []string{at + " must be " + describe(map[string]any{"type": typ})}
	}
	if enum := strs(schema["enum"]); enum != nil {
		if s, _ := v.(string); !slices.Contains(enum, s) {
			return []string{at + " must be one of " + strings.Join(enum, ", ")}
		}
	}
	problems := []string{}
	switch value := v.(type) {
	case map[string]any:
		problems = append(problems, checkObject(tool, schema, value, at)...)
	case []any:
		if n, ok := num(schema["minItems"]); ok && float64(len(value)) < n {
			problems = append(problems, fmt.Sprintf("%s must have at least %v items", at, n))
		}
		if n, ok := num(schema["maxItems"]); ok && float64(len(value)) > n {
			problems = append(problems, fmt.Sprintf("%s must have at most %v items", at, n))
		}
		if items, ok := schema["items"].(map[string]any); ok {
			for i, item := range value {
				problems = append(problems, checkValue(tool, items, item, fmt.Sprintf("%s[%d]", at, i))...)
			}
		}
	case string:
		if n, ok := num(schema["minLength"]); ok && float64(len([]rune(value))) < n {
			if n == 1 {
				problems = append(problems, at+" must not be empty")
			} else {
				problems = append(problems, fmt.Sprintf("%s must have at least %v characters", at, n))
			}
		}
		if n, ok := num(schema["maxLength"]); ok && float64(len([]rune(value))) > n {
			problems = append(problems, fmt.Sprintf("%s must have at most %v characters", at, n))
		}
	case float64:
		if n, ok := num(schema["minimum"]); ok && value < n {
			problems = append(problems, fmt.Sprintf("%s must be at least %v", at, n))
		}
		if n, ok := num(schema["maximum"]); ok && value > n {
			problems = append(problems, fmt.Sprintf("%s must be at most %v", at, n))
		}
	}
	return problems
}

// checkObject は、オブジェクトの引数の、要る名前・知らない名前・各名前の値を確かめる
func checkObject(tool string, schema map[string]any, value map[string]any, at string) []string {
	problems := []string{}
	props, _ := schema["properties"].(map[string]any)
	for _, name := range strs(schema["required"]) {
		if _, ok := value[name]; !ok {
			problems = append(problems, under(at, name)+" is needed")
		}
	}
	names := make([]string, 0, len(value))
	for name := range value {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		if prop, ok := props[name].(map[string]any); ok {
			problems = append(problems, checkValue(tool, prop, value[name], under(at, name))...)
			continue
		}
		switch extra := schema["additionalProperties"].(type) {
		case bool:
			if !extra {
				problems = append(problems, notTaken(tool, props, at, name))
			}
		case map[string]any:
			problems = append(problems, checkValue(tool, extra, value[name], under(at, name))...)
		}
	}
	return problems
}

// notTaken は、受けない名前の引数の文。受ける名前を並べて、AI が 1 回で直せるようにする
func notTaken(tool string, props map[string]any, at, name string) string {
	taken := make([]string, 0, len(props))
	for p := range props {
		taken = append(taken, p)
	}
	slices.Sort(taken)
	list := strings.Join(taken, ", ")
	if len(taken) == 0 {
		list = "none"
	}
	if at == "" {
		return fmt.Sprintf("%s does not take %s (it takes %s)", tool, name, list)
	}
	return fmt.Sprintf("%s does not take %s (it takes %s)", at, name, list)
}

// under は、at の中の名前 name の位置
func under(at, name string) string {
	if at == "" {
		return name
	}
	return at + "." + name
}

// isType は v が JSON Schema の型 typ に合うか（integer は小数を持たない数）
func isType(typ string, v any) bool {
	switch typ {
	case "object":
		_, ok := v.(map[string]any)
		return ok
	case "array":
		_, ok := v.([]any)
		return ok
	case "string":
		_, ok := v.(string)
		return ok
	case "boolean":
		_, ok := v.(bool)
		return ok
	case "number":
		_, ok := v.(float64)
		return ok
	case "integer":
		n, ok := v.(float64)
		return ok && n == math.Trunc(n)
	}
	return false
}

// describe は、スキーマが受ける値の短い言い方（誤りの文に使う）
func describe(schema map[string]any) string {
	if enum := strs(schema["enum"]); enum != nil {
		quoted := []string{}
		for _, e := range enum {
			quoted = append(quoted, `"`+e+`"`)
		}
		return strings.Join(quoted, "|")
	}
	switch schema["type"] {
	case "object":
		props, _ := schema["properties"].(map[string]any)
		if len(props) == 0 {
			return "an object"
		}
		names := make([]string, 0, len(props))
		for p := range props {
			names = append(names, p)
		}
		slices.Sort(names)
		parts := []string{}
		for _, p := range names {
			parts = append(parts, `"`+p+`": `+describe(props[p].(map[string]any)))
		}
		return "{" + strings.Join(parts, ", ") + "}"
	case "array":
		return "an array"
	case "string":
		return "a string"
	case "boolean":
		return "true or false"
	case "number":
		return "a number"
	case "integer":
		return "an integer"
	}
	return "a value"
}

// schemaText は、誤りの文に添える inputSchema（description を外した JSON）
func schemaText(schema map[string]any) string {
	b, _ := json.Marshal(withoutDescriptions(schema))
	return string(b)
}

func withoutDescriptions(v any) any {
	switch value := v.(type) {
	case map[string]any:
		out := map[string]any{}
		for k, x := range value {
			if k != "description" {
				out[k] = withoutDescriptions(x)
			}
		}
		return out
	case []any:
		out := make([]any, len(value))
		for i, x := range value {
			out[i] = withoutDescriptions(x)
		}
		return out
	}
	return v
}

// strs は、スキーマの文字列の並び（required・enum）を読む
func strs(v any) []string {
	switch list := v.(type) {
	case []string:
		return list
	case []any:
		out := []string{}
		for _, x := range list {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

// num は、スキーマの数（minimum・minItems など）を読む
func num(v any) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case float64:
		return n, true
	}
	return 0, false
}
