parseDiscoveryInfo

// parseDiscoveryInfo extracts and validates discovery information from payment bytes.
// Returns (nil, nil) when no discovery data is present.
// Returns an error when discovery data is present but structurally invalid.
func parseDiscoveryInfo(payloadBytes, requirementsBytes []byte) (*parsedDiscoveryInfo, error) {
    discoveredResource, err := bazaar.ExtractDiscoveredResourceFromPaymentPayload(
        payloadBytes,
        requirementsBytes,
        true,
    )
    if err != nil {
        return nil, err
    }


    if discoveredResource == nil {
        return nil, nil
    }


    outputSchema := discovery.TransformDiscoveryInfoToOutputSchema(discoveredResource.DiscoveryInfo)
    if outputSchema == nil {
        return nil, nil
    }


    transportType, err := discovery.ExtractResourceTransportType(outputSchema)
    if err != nil {
        return nil, err
    }


    httpMethod := ""
    if transportType == "http" {
        method, err := discovery.ExtractHTTPResourceMethod(outputSchema)
        if err != nil {
            return nil, err
        }
        if method == "" {
            return nil, errors.New("HTTP method is required for http transport type")
        }
        httpMethod = method
    }


    return &parsedDiscoveryInfo{
        Resource:      discoveredResource,
        OutputSchema:  outputSchema,
        TransportType: transportType,
        HTTPMethod:    httpMethod,
    }, nil
}