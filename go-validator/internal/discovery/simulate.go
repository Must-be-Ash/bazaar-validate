package discovery

import (
	"github.com/bazaar-validate/go-validator/internal/legacy"
)

// Outcome enumerates the possible results of the simulated submit pipeline.
// Mirrors the decision tree in validate/submitDiscoveryJobIfNeeded.md.
type Outcome string

const (
	// OutcomeProcessing — the facilitator would have submitted a discovery job
	// for this resource (i.e. it would be indexed once a payment settles).
	OutcomeProcessing Outcome = "processing"
	// OutcomeRejected — the facilitator would have rejected the discovery
	// submission. The rejection reason is in SimulationResult.RejectedReason.
	OutcomeRejected Outcome = "rejected"
	// OutcomeNoop — no bazaar extension was present (silent pass).
	OutcomeNoop Outcome = "noop"
)

// SimulationResult is the response shape returned by SimulateSubmit.
type SimulationResult struct {
	Outcome        Outcome
	RejectedReason string // populated only when Outcome == OutcomeRejected
	WorkflowIDHint string // a deterministic id the facilitator would use; advisory
}

// SimulateSubmit reproduces the post-parse decision tree the CDP facilitator
// runs in submitDiscoveryJobIfNeeded, without touching Temporal or making any
// network calls. Inputs:
//
//   - info     : the result of ParseDiscoveryInfo (may be nil).
//   - parseErr : any error returned by ParseDiscoveryInfo.
//   - hasBazaar: whether the 402 response carried a bazaar extension at all
//     (some rejection branches only fire when the user *attempted* indexing).
func SimulateSubmit(info *ParsedDiscoveryInfo, parseErr error, hasBazaar bool) SimulationResult {
	// Branch 1: parse failed.
	if parseErr != nil {
		if hasBazaar {
			return SimulationResult{Outcome: OutcomeRejected, RejectedReason: "invalid discovery configuration"}
		}
		return SimulationResult{Outcome: OutcomeNoop}
	}

	// Branch 2: no bazaar extension present.
	if info == nil {
		return SimulationResult{Outcome: OutcomeNoop}
	}

	// Branch 3: unsupported transport.
	if info.TransportType != "http" {
		return SimulationResult{Outcome: OutcomeRejected, RejectedReason: "unsupported transport type: " + info.TransportType}
	}

	// Branch 4: legacy URL/protocol validation. We pass an outputSchema map
	// shaped as legacy expects ({"input": {"type": "http"}}) so the HTTPS
	// gate runs.
	resourceURL := ""
	if info.Resource != nil {
		resourceURL = info.Resource.ResourceURL
	}
	pseudoSchema := map[string]any{
		"input": map[string]any{"type": info.TransportType},
	}
	if err := legacy.ValidateDiscoveryRequest(resourceURL, pseudoSchema, true); err != nil {
		return SimulationResult{Outcome: OutcomeRejected, RejectedReason: "discovery request validation failed"}
	}

	// Branch 5: dynamic route with a template but no extractable concrete URL.
	// The reference flow tries a payload-derived raw URL; we don't have one,
	// so a non-empty RouteTemplate with no resolvable concrete URL is a reject.
	// In practice the SDK gives us the concrete URL via DiscoveredResource.ResourceURL,
	// so the only failure mode is RouteTemplate set + ResourceURL empty.
	if info.Resource != nil && info.Resource.RouteTemplate != "" && info.Resource.ResourceURL == "" {
		return SimulationResult{Outcome: OutcomeRejected, RejectedReason: "invalid discovery configuration"}
	}

	// Branch 6: would submit. Compose a stable workflow id hint so the UI can
	// show "this is the id the facilitator would use".
	hint := "discover-http-" + info.HTTPMethod + "-" + resourceURL
	return SimulationResult{
		Outcome:        OutcomeProcessing,
		WorkflowIDHint: hint,
	}
}
