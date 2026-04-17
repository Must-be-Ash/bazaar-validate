package discovery

import (
	"net/url"
	"regexp"
	"strings"
)

// MatchesRouteTemplate reports whether resourceURL conforms to the bazaar
// routeTemplate. Templates use `:param` placeholders (e.g. "/users/:userId",
// "/weather/:country/:city"). A nil template (empty string) matches any URL —
// callers should only invoke this when a template is actually declared.
//
// The CDP facilitator does NOT enforce this match — it just stores whichever
// concrete URL came in. We do enforce it as a stricter dev-tool check because
// a mismatch usually signals a developer bug (template/URL drift from copy-
// paste or framework-route refactors) that produces a misleading catalog entry.
//
// Matching rules:
//   - Both sides have trailing slashes normalized off (except for the root path).
//   - Each `:param` placeholder matches a single non-empty path segment.
//   - The match is anchored: extra segments at the end of resourceURL fail.
func MatchesRouteTemplate(template, resourceURL string) bool {
	if template == "" {
		return true
	}
	resourcePath, ok := extractPath(resourceURL)
	if !ok {
		return false
	}

	tplPath := normalizePath(template)
	resourcePath = normalizePath(resourcePath)

	pattern := templateToRegex(tplPath)
	re, err := regexp.Compile(pattern)
	if err != nil {
		return false
	}
	return re.MatchString(resourcePath)
}

// extractPath returns the path portion of a URL. Accepts either a full URL
// ("https://example.com/users/123") or a path-only string ("/users/123").
// Returns false if the input parses but has no path at all.
func extractPath(raw string) (string, bool) {
	if raw == "" {
		return "", false
	}
	if strings.HasPrefix(raw, "/") {
		return raw, true
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", false
	}
	if parsed.Path == "" {
		return "/", true
	}
	return parsed.Path, true
}

// normalizePath strips a trailing slash unless the path is just "/".
func normalizePath(p string) string {
	if len(p) > 1 && strings.HasSuffix(p, "/") {
		return strings.TrimRight(p, "/")
	}
	return p
}

// templateToRegex converts a `:param`-style template into an anchored regex.
// Path segments without a colon are escaped literally; segments starting with
// `:` become `([^/]+)`.
func templateToRegex(template string) string {
	segs := strings.Split(template, "/")
	for i, seg := range segs {
		if strings.HasPrefix(seg, ":") {
			segs[i] = `([^/]+)`
		} else {
			segs[i] = regexp.QuoteMeta(seg)
		}
	}
	return "^" + strings.Join(segs, "/") + "$"
}
