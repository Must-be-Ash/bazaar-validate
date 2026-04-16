Legacy Validation
// ValidateDiscoveryRequest validates a discovery request for cdp-service workers.
// This is the original validation logic that was used before the bazaar migration.
// It validates the resource URL and optionally validates the outputSchema structure.
// When requireHTTPS is true, HTTP-protocol resources must use https:// scheme.
func ValidateDiscoveryRequest(resource string, outputSchema map[string]any, requireHTTPS bool) error {
    if resource == "" {
        return errors.New("[discover_resource] resource is required")
    }


    // Try to normalize the URL first to validate its format
    _, err := normalizeResourceURL(resource)
    if err != nil {
        return err
    }


    // Validate OutputSchema structure if present (basic validation only)
    if outputSchema != nil {
        protocolType, err := validatePaymentRequirementSchema(outputSchema)
        if err != nil {
            return err
        }


        // If protocol type is HTTP and HTTPS is required, validate that resource starts with https://
        if protocolType == HTTPProtocol && requireHTTPS {
            if !strings.HasPrefix(resource, "https://") {
                return errors.New("resource must start with 'https://' when protocol type is http")
            }
        }
    }


    return nil
}


// validatePaymentRequirementSchema validates the outputSchema structure.
// This is different from validateOutputSchema which is for discovery requests and requires HTTP-specific fields.
func validatePaymentRequirementSchema(outputSchemaMap map[string]any) (string, error) {
    inputRaw, ok := outputSchemaMap["input"]
    if !ok {
        return "", errors.New("input not found in OutputSchema")
    }


    inputMap, ok := inputRaw.(map[string]any)
    if !ok {
        return "", errors.New("input is not a valid object in OutputSchema")
    }


    // Only validate that type field exists and is a string (no method requirement)
    protocolType, ok := inputMap["type"].(string)
    if !ok {
        return "", errors.New("type not found or not a string in input")
    }


    return protocolType, nil
}

