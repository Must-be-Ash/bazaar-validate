package discovery

import "testing"

func TestMatchesRouteTemplate(t *testing.T) {
	cases := []struct {
		name     string
		template string
		url      string
		want     bool
	}{
		// Empty template is permissive (caller should gate on presence).
		{"empty template matches anything", "", "https://x.com/anything", true},

		// Single-param happy path.
		{"single param matches",
			"/users/:userId",
			"https://example.com/users/123",
			true,
		},
		{"single param matches non-numeric",
			"/users/:userId",
			"https://example.com/users/alice-42",
			true,
		},

		// Mismatches we explicitly want to flag.
		{"different prefix fails",
			"/users/:userId",
			"https://example.com/products/abc",
			false,
		},
		{"missing param segment fails",
			"/users/:userId",
			"https://example.com/users",
			false,
		},
		{"extra segment fails",
			"/users/:userId",
			"https://example.com/users/123/posts",
			false,
		},

		// Multi-param.
		{"multi-param matches",
			"/weather/:country/:city",
			"https://api.example.com/weather/us/sf",
			true,
		},
		{"multi-param mismatched depth",
			"/weather/:country/:city",
			"https://api.example.com/weather/us",
			false,
		},

		// Path-only resource (no scheme/host) should still work.
		{"path-only resource works",
			"/users/:userId",
			"/users/42",
			true,
		},

		// Trailing slash normalization.
		{"trailing slash on resource is ignored",
			"/users/:userId",
			"https://example.com/users/42/",
			true,
		},
		{"trailing slash on template is ignored",
			"/users/:userId/",
			"https://example.com/users/42",
			true,
		},

		// Static template (no params).
		{"static template matches exact",
			"/weather",
			"https://example.com/weather",
			true,
		},
		{"static template fails on mismatch",
			"/weather",
			"https://example.com/forecast",
			false,
		},

		// Param must consume a non-empty segment.
		{"param does not match across slashes",
			"/users/:userId",
			"https://example.com/users//123",
			false,
		},

		// Regex-special chars in the literal portion are escaped.
		{"dots are literal, not regex",
			"/v1.0/:thing",
			"https://example.com/v1.0/x",
			true,
		},
		{"dots are literal — not match arbitrary",
			"/v1.0/:thing",
			"https://example.com/v1X0/x",
			false,
		},

		// Empty resource URL.
		{"empty resource fails",
			"/users/:userId",
			"",
			false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := MatchesRouteTemplate(tc.template, tc.url)
			if got != tc.want {
				t.Fatalf("MatchesRouteTemplate(%q, %q) = %v, want %v",
					tc.template, tc.url, got, tc.want)
			}
		})
	}
}
