package discovery

import (
	"errors"
	"strings"
	"testing"

	"github.com/bazaar-validate/go-validator/internal/sdkadapter"
	"github.com/coinbase/x402/go/extensions/types"
)

func TestSimulateSubmit_NoBazaarIsNoop(t *testing.T) {
	got := SimulateSubmit(nil, nil, false)
	if got.Outcome != OutcomeNoop {
		t.Fatalf("expected noop, got %+v", got)
	}
}

func TestSimulateSubmit_ParseErrWithBazaarRejects(t *testing.T) {
	got := SimulateSubmit(nil, errors.New("boom"), true)
	if got.Outcome != OutcomeRejected || got.RejectedReason != "invalid discovery configuration" {
		t.Fatalf("expected rejected/invalid discovery configuration, got %+v", got)
	}
}

func TestSimulateSubmit_ParseErrWithoutBazaarIsNoop(t *testing.T) {
	got := SimulateSubmit(nil, errors.New("boom"), false)
	if got.Outcome != OutcomeNoop {
		t.Fatalf("expected noop when no bazaar present, got %+v", got)
	}
}

func TestSimulateSubmit_UnsupportedTransportRejects(t *testing.T) {
	info := &ParsedDiscoveryInfo{
		Resource:      &sdkadapter.DiscoveredResource{ResourceURL: "wss://example.com/x"},
		TransportType: "websocket",
	}
	got := SimulateSubmit(info, nil, true)
	if got.Outcome != OutcomeRejected || !strings.Contains(got.RejectedReason, "websocket") {
		t.Fatalf("expected unsupported transport reject, got %+v", got)
	}
}

func TestSimulateSubmit_NonHTTPSRejected(t *testing.T) {
	info := &ParsedDiscoveryInfo{
		Resource: &sdkadapter.DiscoveredResource{
			ResourceURL: "http://example.com/x",
			DiscoveryInfo: &types.DiscoveryInfo{
				Input: types.QueryInput{Type: "http", Method: types.MethodGET},
			},
		},
		TransportType: "http",
		HTTPMethod:    "get",
	}
	got := SimulateSubmit(info, nil, true)
	if got.Outcome != OutcomeRejected || got.RejectedReason != "discovery request validation failed" {
		t.Fatalf("expected validation reject for http://, got %+v", got)
	}
}

func TestSimulateSubmit_HappyPathProcessing(t *testing.T) {
	info := &ParsedDiscoveryInfo{
		Resource: &sdkadapter.DiscoveredResource{
			ResourceURL: "https://example.com/weather",
			DiscoveryInfo: &types.DiscoveryInfo{
				Input: types.QueryInput{Type: "http", Method: types.MethodGET},
			},
		},
		TransportType: "http",
		HTTPMethod:    "get",
	}
	got := SimulateSubmit(info, nil, true)
	if got.Outcome != OutcomeProcessing {
		t.Fatalf("expected processing, got %+v", got)
	}
	if !strings.Contains(got.WorkflowIDHint, "https://example.com/weather") {
		t.Fatalf("workflow id hint missing URL: %q", got.WorkflowIDHint)
	}
}

func TestSimulateSubmit_DynamicRouteWithoutConcreteURLRejected(t *testing.T) {
	info := &ParsedDiscoveryInfo{
		Resource: &sdkadapter.DiscoveredResource{
			ResourceURL:   "",
			RouteTemplate: "/users/:userId",
			DiscoveryInfo: &types.DiscoveryInfo{
				Input: types.QueryInput{Type: "http", Method: types.MethodGET},
			},
		},
		TransportType: "http",
		HTTPMethod:    "get",
	}
	got := SimulateSubmit(info, nil, true)
	// With ResourceURL empty, the legacy URL validator fires first and returns
	// a "discovery request validation failed" — both rejections are acceptable
	// here; the important thing is that we don't return OutcomeProcessing.
	if got.Outcome != OutcomeRejected {
		t.Fatalf("expected reject for dynamic route w/o concrete URL, got %+v", got)
	}
}
