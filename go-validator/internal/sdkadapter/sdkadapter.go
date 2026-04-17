// Package sdkadapter wraps the public x402 Go SDK so the rest of the validator
// imports a stable surface. The SDK function names (ExtractDiscoveredResourceFromPaymentRequired,
// ValidateDiscoveryExtension) are long; this package gives them shorter local
// aliases AND lets us swap implementations later (e.g. when CDP exposes an
// authenticated validation endpoint per Phase 10 of the spec).
//
// Why we don't port the lower-level helpers from validate/helpers.md:
//
//	The reference docs (parseDiscoveryInfo, TransformDiscoveryInfoToOutputSchema,
//	ExtractResourceTransportType, ExtractHTTPResourceMethod) describe the
//	facilitator's *internal* pipeline. The public SDK exposes a higher-level
//	function — ExtractDiscoveredResourceFromPaymentRequired — that runs all of
//	those steps for us and returns a typed DiscoveredResource with ResourceURL,
//	Method, X402Version, DiscoveryInfo, Description, MimeType, and RouteTemplate.
//	Re-implementing the helpers would just duplicate code the SDK already exposes.
package sdkadapter

import (
	"github.com/coinbase/x402/go/extensions/bazaar"
	"github.com/coinbase/x402/go/extensions/types"
)

// DiscoveredResource is re-exported so callers don't have to import the
// SDK directly.
type DiscoveredResource = bazaar.DiscoveredResource

// DiscoveryExtension and DiscoveryInfo are re-exported types used by callers
// that want to inspect the parsed extension contents.
type DiscoveryExtension = types.DiscoveryExtension
type DiscoveryInfo = types.DiscoveryInfo

// SchemaValidationResult mirrors bazaar.ValidationResult.
type SchemaValidationResult = bazaar.ValidationResult

// ExtractFromPaymentRequired runs the full bazaar parse stage on the raw bytes
// of a 402 Payment Required response.
//
//   - validate=true: also runs JSON-Schema validation on the bazaar extension's
//     `info` against its `schema`.
//   - Returns (nil, nil) when the response has no bazaar extension at all
//     (the SDK signals this by returning a nil resource and a nil error).
//   - Returns an error when the bazaar extension is present but malformed.
func ExtractFromPaymentRequired(paymentRequiredBytes []byte, validate bool) (*DiscoveredResource, error) {
	return bazaar.ExtractDiscoveredResourceFromPaymentRequired(paymentRequiredBytes, validate)
}

// ValidateExtension runs the JSON-Schema check on a parsed extension.
func ValidateExtension(ext DiscoveryExtension) SchemaValidationResult {
	return bazaar.ValidateDiscoveryExtension(ext)
}
