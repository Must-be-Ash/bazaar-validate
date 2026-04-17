// Package discovery mirrors the facilitator's discovery pipeline: parse the
// bazaar extension out of a 402 response (parseDiscoveryInfo), then run the
// submit decision tree (submitDiscoveryJobIfNeeded). See validate/parseDiscoveryInfo.md
// and validate/submitDiscoveryJobIfNeeded.md in the repo root.
package discovery

import (
	"errors"
	"strings"

	"github.com/bazaar-validate/go-validator/internal/sdkadapter"
	"github.com/coinbase/x402/go/extensions/types"
)

// ParsedDiscoveryInfo is the result of parseDiscoveryInfo. Mirrors
// validate/parseDiscoveryInfo.md.
type ParsedDiscoveryInfo struct {
	Resource      *sdkadapter.DiscoveredResource
	TransportType string // "http", or other (lowercased)
	HTTPMethod    string // populated when TransportType == "http"; lowercased
}

// ParseDiscoveryInfo extracts and structurally validates the bazaar discovery
// information from a 402 Payment Required response body.
//
// Return semantics match validate/parseDiscoveryInfo.md:
//
//   - (nil, nil)   — no bazaar extension is present (silent no-op).
//   - (info, nil)  — bazaar extension parsed successfully; info is populated.
//   - (nil, err)   — bazaar extension is present but malformed.
func ParseDiscoveryInfo(paymentRequiredBytes []byte) (*ParsedDiscoveryInfo, error) {
	resource, err := sdkadapter.ExtractFromPaymentRequired(paymentRequiredBytes, true)
	if err != nil {
		return nil, err
	}
	if resource == nil {
		return nil, nil
	}

	transportType, err := extractTransportType(resource.DiscoveryInfo)
	if err != nil {
		return nil, err
	}

	httpMethod := ""
	if transportType == "http" {
		method, err := extractHTTPMethod(resource.DiscoveryInfo)
		if err != nil {
			return nil, err
		}
		if method == "" {
			return nil, errors.New("HTTP method is required for http transport type")
		}
		httpMethod = method
	}

	return &ParsedDiscoveryInfo{
		Resource:      resource,
		TransportType: transportType,
		HTTPMethod:    httpMethod,
	}, nil
}

// extractTransportType pulls the transport type ("http", etc.) from the typed
// DiscoveryInfo.Input (which is either QueryInput or BodyInput). Mirrors
// discovery.ExtractResourceTransportType from validate/helpers.md but operates
// on the SDK's typed value rather than a raw map.
func extractTransportType(info *types.DiscoveryInfo) (string, error) {
	if info == nil {
		return "", errors.New("[discover_resource] DiscoveryInfo is required")
	}
	switch in := info.Input.(type) {
	case types.QueryInput:
		if in.Type == "" {
			return "", errors.New("[discover_resource] type not found or not a string in input")
		}
		return strings.ToLower(in.Type), nil
	case types.BodyInput:
		if in.Type == "" {
			return "", errors.New("[discover_resource] type not found or not a string in input")
		}
		return strings.ToLower(in.Type), nil
	case nil:
		return "", errors.New("[discover_resource] input not found in OutputSchema")
	default:
		return "", errors.New("[discover_resource] input has an unrecognized shape")
	}
}

// extractHTTPMethod pulls the HTTP method from the typed DiscoveryInfo.Input.
// Mirrors discovery.ExtractHTTPResourceMethod from validate/helpers.md.
func extractHTTPMethod(info *types.DiscoveryInfo) (string, error) {
	if info == nil {
		return "", errors.New("[discover_resource] DiscoveryInfo is required")
	}
	switch in := info.Input.(type) {
	case types.QueryInput:
		return strings.ToLower(string(in.Method)), nil
	case types.BodyInput:
		return strings.ToLower(string(in.Method)), nil
	default:
		return "", errors.New("[discover_resource] input has no method field")
	}
}
