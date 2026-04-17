package discovery

import (
	"strings"
	"testing"
)

const noBazaar402 = `{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "amount": "1000",
    "payTo": "0x0000000000000000000000000000000000000001",
    "maxTimeoutSeconds": 60
  }],
  "resource": { "url": "https://example.com/weather" }
}`

const validBazaar402 = `{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:84532",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "amount": "1000",
    "payTo": "0x0000000000000000000000000000000000000001",
    "maxTimeoutSeconds": 60
  }],
  "resource": { "url": "https://example.com/weather" },
  "extensions": {
    "bazaar": {
      "info": {
        "input": { "type": "http", "method": "GET" },
        "output": { "type": "json", "example": { "temperature": 72 } }
      },
      "schema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object"
      }
    }
  }
}`

func TestParseDiscoveryInfo_NoBazaarExtension(t *testing.T) {
	info, err := ParseDiscoveryInfo([]byte(noBazaar402))
	if err != nil {
		t.Fatalf("expected nil error for no-bazaar response, got: %v", err)
	}
	if info != nil {
		t.Fatalf("expected nil ParsedDiscoveryInfo for no-bazaar response, got: %+v", info)
	}
}

func TestParseDiscoveryInfo_HappyPathHTTPGet(t *testing.T) {
	info, err := ParseDiscoveryInfo([]byte(validBazaar402))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info == nil {
		t.Fatal("expected ParsedDiscoveryInfo to be non-nil")
	}
	if info.TransportType != "http" {
		t.Fatalf("transportType: want http, got %q", info.TransportType)
	}
	if info.HTTPMethod != "get" {
		t.Fatalf("httpMethod: want get, got %q", info.HTTPMethod)
	}
	if info.Resource == nil || info.Resource.ResourceURL != "https://example.com/weather" {
		t.Fatalf("resource URL not propagated: %+v", info.Resource)
	}
}

func TestParseDiscoveryInfo_MalformedExtensionRejected(t *testing.T) {
	// Bazaar extension with an info that doesn't match its schema (no input).
	bad := `{
      "x402Version": 2,
      "accepts": [{
        "scheme": "exact",
        "network": "eip155:84532",
        "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "amount": "1000",
        "payTo": "0x0000000000000000000000000000000000000001",
        "maxTimeoutSeconds": 60
      }],
      "resource": { "url": "https://example.com/weather" },
      "extensions": { "bazaar": "not-an-object" }
    }`
	info, err := ParseDiscoveryInfo([]byte(bad))
	if err == nil {
		t.Fatalf("expected error for malformed bazaar extension, got nil (info=%+v)", info)
	}
	if info != nil {
		t.Fatalf("expected nil info on error, got: %+v", info)
	}
	if !strings.Contains(strings.ToLower(err.Error()), "extension") &&
		!strings.Contains(strings.ToLower(err.Error()), "json") &&
		!strings.Contains(strings.ToLower(err.Error()), "unmarshal") {
		t.Logf("note: error was: %v", err)
	}
}
