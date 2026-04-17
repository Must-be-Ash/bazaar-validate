package legacy

import (
	"strings"
	"testing"
)

func TestValidateDiscoveryRequest_EmptyResource(t *testing.T) {
	if err := ValidateDiscoveryRequest("", nil, true); err == nil {
		t.Fatal("expected error for empty resource")
	}
}

func TestValidateDiscoveryRequest_HTTPSRequired(t *testing.T) {
	schema := map[string]any{
		"input": map[string]any{"type": "http"},
	}
	if err := ValidateDiscoveryRequest("http://example.com/x", schema, true); err == nil {
		t.Fatal("expected error for non-https http resource when requireHTTPS=true")
	}
	if err := ValidateDiscoveryRequest("https://example.com/x", schema, true); err != nil {
		t.Fatalf("unexpected error for https resource: %v", err)
	}
}

func TestValidateDiscoveryRequest_HTTPSNotRequiredWhenFlagOff(t *testing.T) {
	schema := map[string]any{
		"input": map[string]any{"type": "http"},
	}
	if err := ValidateDiscoveryRequest("http://example.com/x", schema, false); err != nil {
		t.Fatalf("did not expect error when requireHTTPS=false: %v", err)
	}
}

func TestValidateDiscoveryRequest_NilSchemaSkipsTypeCheck(t *testing.T) {
	if err := ValidateDiscoveryRequest("https://example.com/x", nil, true); err != nil {
		t.Fatalf("nil schema should skip type check: %v", err)
	}
}

func TestValidateDiscoveryRequest_BadInputType(t *testing.T) {
	schema := map[string]any{
		"input": map[string]any{"type": 42},
	}
	err := ValidateDiscoveryRequest("https://example.com/x", schema, true)
	if err == nil || !strings.Contains(err.Error(), "type") {
		t.Fatalf("expected type-not-string error, got: %v", err)
	}
}

func TestValidateDiscoveryRequest_MalformedURL(t *testing.T) {
	if err := ValidateDiscoveryRequest("::not a url", nil, true); err == nil {
		t.Fatal("expected error for malformed URL")
	}
}
