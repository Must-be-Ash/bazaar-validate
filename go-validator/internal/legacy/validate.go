// Package legacy ports the discovery URL/protocol validation that the CDP
// facilitator runs as a pre-filter before submitting a Bazaar discovery job.
// See validate/legacy.md in the repo root for the original Go reference.
//
// The exported surface mirrors the original signatures so future readers can
// match them against the reference doc one-to-one.
package legacy

import (
	"errors"
	"net/url"
	"strings"
)

// HTTPProtocol is the value of `outputSchema.input.type` that signals a
// crawlable HTTP endpoint (vs. e.g. a non-HTTP transport).
const HTTPProtocol = "http"

// ValidateDiscoveryRequest validates a discovery request before any
// downstream submission. Mirrors `legacy.ValidateDiscoveryRequest` from
// validate/legacy.md.
//
//   - resource: the resource URL the facilitator will catalog.
//   - outputSchema: optional. When present, the schema's `input.type` is
//     extracted; if it equals "http" and requireHTTPS is true, the resource
//     URL must use https://.
//   - requireHTTPS: enforces the HTTPS gate on http transport resources.
func ValidateDiscoveryRequest(resource string, outputSchema map[string]any, requireHTTPS bool) error {
	if resource == "" {
		return errors.New("[discover_resource] resource is required")
	}

	if _, err := normalizeResourceURL(resource); err != nil {
		return err
	}

	if outputSchema != nil {
		protocolType, err := validatePaymentRequirementSchema(outputSchema)
		if err != nil {
			return err
		}
		if protocolType == HTTPProtocol && requireHTTPS {
			if !strings.HasPrefix(resource, "https://") {
				return errors.New("resource must start with 'https://' when protocol type is http")
			}
		}
	}

	return nil
}

// validatePaymentRequirementSchema extracts and validates the `input.type`
// field from an outputSchema map. Returns the protocol type string (e.g. "http").
func validatePaymentRequirementSchema(outputSchemaMap map[string]any) (string, error) {
	inputRaw, ok := outputSchemaMap["input"]
	if !ok {
		return "", errors.New("input not found in OutputSchema")
	}

	inputMap, ok := inputRaw.(map[string]any)
	if !ok {
		return "", errors.New("input is not a valid object in OutputSchema")
	}

	protocolType, ok := inputMap["type"].(string)
	if !ok {
		return "", errors.New("type not found or not a string in input")
	}

	return protocolType, nil
}

// normalizeResourceURL parses and normalizes a resource URL. Mirrors the
// private helper of the same name in the SDK's bazaar package.
//
// We strip query params and fragments so the canonical URL is what gets
// cataloged. Returns the normalized URL string or an error if parsing fails.
func normalizeResourceURL(rawURL string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("resource URL must include scheme and host")
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}
