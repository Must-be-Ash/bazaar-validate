submitDiscoveryJobIfNeeded
func (f *facilitator) submitDiscoveryJobIfNeeded(
    ctx context.Context,
    info *parsedDiscoveryInfo,
    parseErr error,
    paymentPayloadBytes []byte,
    paymentRequirementsBytes []byte,
) *BazaarResponse {
    hasBazaar := containsBazaarExtension(paymentPayloadBytes, paymentRequirementsBytes)


    if !f.config.BackgroundJobsServiceClient.Queues.DiscoveryEnabled {
        if hasBazaar {
            return &BazaarResponse{Status: BazaarStatusRejected, RejectedReason: "discovery not enabled"}
        }
        return nil
    }


    logger := logging.ContextLogger(ctx)


    if parseErr != nil {
        logger.Warn("failed to parse discovery info", zap.Error(parseErr))
        if hasBazaar {
            return &BazaarResponse{Status: BazaarStatusRejected, RejectedReason: "invalid discovery configuration"}
        }
        return nil
    }


    if info == nil {
        return nil
    }


    if info.TransportType != "http" {
        logger.Info("skipping discovery jobs for non-HTTP transport type",
            zap.String("resource", info.Resource.ResourceURL),
            zap.String("transportType", info.TransportType))
        return &BazaarResponse{Status: BazaarStatusRejected, RejectedReason: "unsupported transport type: " + info.TransportType}
    }


    // Use legacy validation to filter out bad URLs.
    err := legacy.ValidateDiscoveryRequest(
        info.Resource.ResourceURL,
        info.OutputSchema,
        f.config.BackgroundJobsServiceClient.Queues.SecureValidationsEnabled,
    )
    if err != nil {
        logger.Info("invalid discovery request", zap.String("resource", info.Resource.ResourceURL), zap.Error(err))
        return &BazaarResponse{Status: BazaarStatusRejected, RejectedReason: "discovery request validation failed"}
    }


    if f.temporalClient == nil {
        logger.Warn("temporal client not configured, skipping discovery workflow submission")
        return &BazaarResponse{Status: BazaarStatusRejected, RejectedReason: "discovery service unavailable"}
    }


    // The workflow ID uses the template-normalized URL so all concrete instances
    // of the same dynamic route map to one workflow.
    normalizedURL, _ := discovery.NormalizeResourceURL(info.Resource.ResourceURL)
    if normalizedURL == "" {
        normalizedURL = info.Resource.ResourceURL
    }


    workflowOptions := client.StartWorkflowOptions{
        ID: fmt.Sprintf(
            "discover-http-%s",
            discovery.ComputeResourceHash(normalizedURL, "http", info.HTTPMethod),
        ),
        TaskQueue:                bazaarworker.BazaarTaskQueue,
        WorkflowIDConflictPolicy: enumspb.WORKFLOW_ID_CONFLICT_POLICY_USE_EXISTING,
    }


    // For dynamic routes the SDK normalizes ResourceURL to the template
    // (e.g. /users/:userId), which isn't crawlable. Pass the concrete URL from
    // the payment payload so the worker can fetch a real 402 response.
    crawlResource := info.Resource.ResourceURL
    if info.Resource.RouteTemplate != "" {
        if rawURL := extractRawResourceURL(paymentPayloadBytes); rawURL != "" {
            crawlResource = rawURL
        } else {
            logger.Warn("dynamic route has template URL but could not extract concrete URL from payload, skipping discovery",
                zap.String("resource", info.Resource.ResourceURL),
                zap.String("routeTemplate", info.Resource.RouteTemplate))
            return &BazaarResponse{Status: BazaarStatusRejected, RejectedReason: "invalid discovery configuration"}
        }
    }


    workflowInput := bazaarworker.DiscoverHTTPResourceInput{
        Resource:     crawlResource,
        OutputSchema: info.OutputSchema,
    }


    if _, err := f.temporalClient.ExecuteWorkflow(ctx, workflowOptions, bazaarworker.DiscoverHTTPResourceWorkflowName, workflowInput); err != nil {
        logger.Warn("failed to submit discover HTTP resource workflow",
            zap.String("resource", info.Resource.ResourceURL),
            zap.Error(err))
        return &BazaarResponse{Status: BazaarStatusRejected, RejectedReason: "failed to submit discovery job"}
    }


    logger.Info("submitted discover HTTP resource workflow",
        zap.String("resource", info.Resource.ResourceURL),
        zap.String("workflowID", workflowOptions.ID),
        zap.String("transportType", info.TransportType),
        zap.String("httpMethod", info.HTTPMethod),
        zap.Any("bazaarInfo", buildSafeDiscoveryLogShape(info.OutputSchema)))
    return &BazaarResponse{Status: BazaarStatusProcessing}
}

