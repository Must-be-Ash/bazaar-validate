> ## Documentation Index
> Fetch the complete documentation index at: https://docs.cdp.coinbase.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Quickstart for Sellers

This guide walks you through integrating with x402 to enable payments for your API or service. By the end, your API will be able to charge buyers and AI agents for access.

<Note>
  This quickstart begins with testnet configuration for safe testing. When
  you're ready for production, see [Running on Mainnet](#running-on-mainnet) for
  the simple changes needed to accept real payments on Base (EVM), Polygon,
  Arbitrum, World, and Solana networks.
</Note>

<Info>
  Need help? Join the [x402 Discord](https://discord.gg/cdp) for the latest
  updates.
</Info>

## Facilitator URLs

| Environment             | Facilitator URL                                 | Networks                                                                           | Auth                  |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------- |
| **CDP (recommended)**   | `https://api.cdp.coinbase.com/platform/v2/x402` | Base, Base Sepolia, Polygon, Arbitrum, World, World Sepolia, Solana, Solana Devnet | CDP API keys required |
| x402.org (testnet only) | `https://x402.org/facilitator`                  | Base Sepolia, Solana Devnet                                                        | None                  |

We recommend the CDP facilitator for both testnet and mainnet—it supports all networks with a generous free tier. The examples below use the x402.org facilitator for a signup-free quick start; see [Running on Mainnet](#running-on-mainnet) to switch to CDP.

## Prerequisites

Before you begin, ensure you have:

* A crypto wallet to receive funds (any EVM-compatible wallet, e.g., [CDP Wallet](/server-wallets/v2/introduction/quickstart))
* A [Coinbase Developer Platform](https://cdp.coinbase.com) (CDP) account and API keys (recommended for production; examples below use x402.org for signup-free testing)
* [Node.js](https://nodejs.org/en) and npm, [Go](https://go.dev/), or Python and pip installed
* An existing API or server
* **For testnet:** Base Sepolia ETH for gas and testnet USDC for payments. Get funds from the [CDP Faucet](/faucets/introduction/quickstart)

<Info>
  We have pre-configured examples available in our repo for both
  [Node.js](https://github.com/coinbase/x402/tree/main/examples/typescript/servers)
  and [Go](https://github.com/coinbase/x402/tree/main/examples/go/servers). We
  also have an [advanced
  example](https://github.com/coinbase/x402/tree/main/examples/typescript/servers/advanced)
  that shows how to use the x402 SDKs to build a more complex payment flow.
</Info>

## 1. Install Dependencies

<Tabs>
  <Tab title="Node.js">
    <Tabs>
      <Tab title="Express">
        Install the x402 Express middleware and EVM mechanism packages:

        ```bash  theme={null}
        npm install @x402/express @x402/evm @x402/core
        ```
      </Tab>

      <Tab title="Next.js">
        Install the x402 Next.js middleware and EVM mechanism packages:

        ```bash  theme={null}
        npm install @x402/next @x402/evm @x402/core
        ```
      </Tab>

      <Tab title="Hono">
        Install the x402 Hono middleware and EVM mechanism packages:

        ```bash  theme={null}
        npm install @x402/hono @x402/evm @x402/core
        ```
      </Tab>
    </Tabs>
  </Tab>

  <Tab title="Go">
    Add the x402 Go module to your project:

    ```bash  theme={null}
    go get github.com/coinbase/x402/go
    ```
  </Tab>

  <Tab title="Python">
    <Tabs>
      <Tab title="FastAPI">
        [Install the x402 Python package](https://pypi.org/project/x402/) with FastAPI support:

        ```bash  theme={null}
        pip install "x402[fastapi]"

        # For Solana support, also add:
        pip install "x402[svm]"
        ```
      </Tab>

      <Tab title="Flask">
        [Install the x402 Python package](https://pypi.org/project/x402/) with Flask support:

        ```bash  theme={null}
        pip install "x402[flask]"

        # For Solana support, also add:
        pip install "x402[svm]"
        ```
      </Tab>
    </Tabs>
  </Tab>
</Tabs>

## 2. Add Payment Middleware

Integrate the payment middleware into your application. You will need to provide:

* The Facilitator URL or facilitator client. We recommend CDP for both testnet and mainnet (see [Running on Mainnet](#running-on-mainnet)). The examples below use `https://x402.org/facilitator` for a quick test without signup.
* The routes you want to protect
* Your receiving wallet address

<Tip>
  The examples below show testnet configuration. When you're ready to accept
  real payments, refer to [Running on Mainnet](#running-on-mainnet) for the
  simple changes needed.
</Tip>

<Tabs>
  <Tab title="Node.js">
    <Tabs>
      <Tab title="Express">
        Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/typescript/servers/express).

        ```typescript  theme={null}
        import express from "express";
        import { paymentMiddleware, x402ResourceServer } from "@x402/express";
        import { ExactEvmScheme } from "@x402/evm/exact/server";
        import { HTTPFacilitatorClient } from "@x402/core/server";

        const app = express();

        // Your receiving wallet address
        const payTo = "0xYourAddress";

        // Create facilitator client (testnet)
        const facilitatorClient = new HTTPFacilitatorClient({
          url: "https://x402.org/facilitator"
        });

        // Create resource server and register EVM scheme
        const server = new x402ResourceServer(facilitatorClient)
          .register("eip155:84532", new ExactEvmScheme());

        app.use(
          paymentMiddleware(
            {
              "GET /weather": {
                accepts: [
                  {
                    scheme: "exact",
                    price: "$0.001", // USDC amount in dollars
                    network: "eip155:84532", // Base Sepolia (CAIP-2 format)
                    payTo,
                  },
                ],
                description: "Get current weather data for any location",
                mimeType: "application/json",
              },
            },
            server,
          ),
        );

        // Implement your route
        app.get("/weather", (req, res) => {
          res.send({
            report: {
              weather: "sunny",
              temperature: 70,
            },
          });
        });

        app.listen(4021, () => {
          console.log(`Server listening at http://localhost:4021`);
        });
        ```
      </Tab>

      <Tab title="Next.js">
        Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/typescript/fullstack/next).

        ```typescript  theme={null}
        // middleware.ts
        import { paymentProxy, x402ResourceServer } from "@x402/next";
        import { ExactEvmScheme } from "@x402/evm/exact/server";
        import { HTTPFacilitatorClient } from "@x402/core/server";

        const payTo = "0xYourAddress";

        const facilitatorClient = new HTTPFacilitatorClient({
          url: "https://x402.org/facilitator"
        });

        const server = new x402ResourceServer(facilitatorClient)
          .register("eip155:84532", new ExactEvmScheme());

        export const middleware = paymentProxy(
          {
            "/api/protected": {
              accepts: [
                {
                  scheme: "exact",
                  price: "$0.01",
                  network: "eip155:84532",
                  payTo,
                },
              ],
              description: "Access to protected content",
              mimeType: "application/json",
            },
          },
          server,
        );

        export const config = {
          matcher: ["/api/protected/:path*"],
        };
        ```
      </Tab>

      <Tab title="Hono">
        Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/typescript/servers/hono).

        ```typescript  theme={null}
        import { Hono } from "hono";
        import { serve } from "@hono/node-server";
        import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
        import { ExactEvmScheme } from "@x402/evm/exact/server";
        import { HTTPFacilitatorClient } from "@x402/core/server";

        const app = new Hono();
        const payTo = "0xYourAddress";

        const facilitatorClient = new HTTPFacilitatorClient({
          url: "https://x402.org/facilitator"
        });

        const server = new x402ResourceServer(facilitatorClient)
          .register("eip155:84532", new ExactEvmScheme());

        app.use(
          paymentMiddleware(
            {
              "/protected-route": {
                accepts: [
                  {
                    scheme: "exact",
                    price: "$0.10",
                    network: "eip155:84532",
                    payTo,
                  },
                ],
                description: "Access to premium content",
                mimeType: "application/json",
              },
            },
            server,
          ),
        );

        app.get("/protected-route", (c) => {
          return c.json({ message: "This content is behind a paywall" });
        });

        serve({ fetch: app.fetch, port: 3000 });
        ```
      </Tab>
    </Tabs>
  </Tab>

  <Tab title="Go">
    <Tabs>
      <Tab title="Gin">
        Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/go/servers/gin).

        ```go  theme={null}
        package main

        import (
            "net/http"
            "time"

            x402 "github.com/coinbase/x402/go"
            x402http "github.com/coinbase/x402/go/http"
            ginmw "github.com/coinbase/x402/go/http/gin"
            evm "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
            "github.com/gin-gonic/gin"
        )

        func main() {
            payTo := "0xYourAddress"
            network := x402.Network("eip155:84532") // Base Sepolia (CAIP-2 format)

            r := gin.Default()

            // Create facilitator client
            facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
                URL: "https://x402.org/facilitator",
            })

            // Apply x402 payment middleware
            r.Use(ginmw.X402Payment(ginmw.Config{
                Routes: x402http.RoutesConfig{
                    "GET /weather": {
                        Scheme:      "exact",
                        PayTo:       payTo,
                        Price:       "$0.001",
                        Network:     network,
                        Description: "Get weather data for a city",
                        MimeType:    "application/json",
                    },
                },
                Facilitator: facilitatorClient,
                Schemes: []ginmw.SchemeConfig{
                    {Network: network, Server: evm.NewExactEvmScheme()},
                },
                Initialize: true,
                Timeout:    30 * time.Second,
            }))

            // Protected endpoint
            r.GET("/weather", func(c *gin.Context) {
                c.JSON(http.StatusOK, gin.H{
                    "weather":     "sunny",
                    "temperature": 70,
                })
            })

            r.Run(":4021")
        }
        ```
      </Tab>
    </Tabs>
  </Tab>

  <Tab title="Python">
    <Tabs>
      <Tab title="FastAPI">
        Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/python/servers/fastapi).

        ```python  theme={null}
        from typing import Any

        from fastapi import FastAPI

        from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
        from x402.http.middleware.fastapi import PaymentMiddlewareASGI
        from x402.http.types import RouteConfig
        from x402.mechanisms.evm.exact import ExactEvmServerScheme
        from x402.server import x402ResourceServer

        app = FastAPI()

        # Your receiving wallet address
        pay_to = "0xYourAddress"

        # Create facilitator client (testnet)
        facilitator = HTTPFacilitatorClient(
            FacilitatorConfig(url="https://x402.org/facilitator")
        )

        # Create resource server and register EVM scheme
        server = x402ResourceServer(facilitator)
        server.register("eip155:84532", ExactEvmServerScheme())

        # Define protected routes
        routes: dict[str, RouteConfig] = {
            "GET /weather": RouteConfig(
                accepts=[
                    PaymentOption(
                        scheme="exact",
                        pay_to=pay_to,
                        price="$0.001",  # USDC amount in dollars
                        network="eip155:84532",  # Base Sepolia (CAIP-2 format)
                    ),
                ],
                mime_type="application/json",
                description="Get current weather data for any location",
            ),
        }

        # Add payment middleware
        app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)


        @app.get("/weather")
        async def get_weather() -> dict[str, Any]:
            return {
                "report": {
                    "weather": "sunny",
                    "temperature": 70,
                }
            }


        if __name__ == "__main__":
            import uvicorn
            uvicorn.run(app, host="0.0.0.0", port=4021)
        ```
      </Tab>

      <Tab title="Flask">
        Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/python/servers/flask).

        ```python  theme={null}
        from flask import Flask, jsonify

        from x402.http import FacilitatorConfig, HTTPFacilitatorClientSync, PaymentOption
        from x402.http.middleware.flask import payment_middleware
        from x402.http.types import RouteConfig
        from x402.mechanisms.evm.exact import ExactEvmServerScheme
        from x402.server import x402ResourceServerSync

        app = Flask(__name__)

        pay_to = "0xYourAddress"

        facilitator = HTTPFacilitatorClientSync(
            FacilitatorConfig(url="https://x402.org/facilitator")
        )

        server = x402ResourceServerSync(facilitator)
        server.register("eip155:84532", ExactEvmServerScheme())

        routes: dict[str, RouteConfig] = {
            "GET /weather": RouteConfig(
                accepts=[
                    PaymentOption(
                        scheme="exact",
                        pay_to=pay_to,
                        price="$0.001",
                        network="eip155:84532",
                    ),
                ],
                mime_type="application/json",
                description="Get current weather data for any location",
            ),
        }

        payment_middleware(app, routes=routes, server=server)


        @app.route("/weather")
        def get_weather():
            return jsonify({
                "report": {
                    "weather": "sunny",
                    "temperature": 70,
                }
            })


        if __name__ == "__main__":
            app.run(host="0.0.0.0", port=4021)
        ```
      </Tab>
    </Tabs>
  </Tab>
</Tabs>

<Note>
  Ready to accept real payments? See [Running on Mainnet](#running-on-mainnet)
  for production setup.
</Note>

<Tip>
  **Price format:** Use a dollar-prefixed string (e.g. `"$0.001"` or `"$0.10"`). Omitting the `$` can cause validation errors.
</Tip>

**Route Configuration Interface:**

Route configs are defined as a map where each key is a route pattern string (e.g., `"GET /weather"`, `"GET /articles/:slug"`, `"GET /api/*"`) and the value is a `RouteConfig` object:

```typescript  theme={null}
interface RouteConfig {
  accepts: Array<{
    scheme: string; // Payment scheme (e.g., "exact")
    price: string; // Price in dollars (e.g., "$0.01") — must include $ prefix
    network: string; // Network in CAIP-2 format (e.g., "eip155:84532")
    payTo: string; // Your wallet address
  }>;
  description?: string; // Description of the resource
  mimeType?: string; // MIME type of the response
  extensions?: object; // Optional extensions (e.g., Bazaar, gas sponsorship)
}
```

When a request is made to these routes without payment, your server will respond with the HTTP 402 Payment Required code and payment instructions.

### Dynamic Route Patterns

Route keys support dynamic path segments, letting a single route configuration match multiple URLs. Three pattern styles are supported:

| Pattern                   | Example key              | Matches                                  |
| ------------------------- | ------------------------ | ---------------------------------------- |
| `:param` (Express-style)  | `"GET /articles/:slug"`  | `/articles/hello-world`, `/articles/123` |
| `[param]` (Next.js-style) | `"GET /articles/[slug]"` | `/articles/hello-world`, `/articles/123` |
| `*` (wildcard)            | `"GET /api/*"`           | `/api/anything`, `/api/a/b/c`            |

If no HTTP method is specified in the key, the route matches all HTTP methods.

<Tabs>
  <Tab title="Node.js (Express)">
    ```typescript  theme={null}
    app.use(
      paymentMiddleware(
        {
          // Named param — matches /articles/any-slug
          "GET /articles/:slug": {
            accepts: [
              {
                scheme: "exact",
                price: "$0.01",
                network: "eip155:84532",
                payTo,
              },
            ],
            description: "Read a premium article by slug",
            mimeType: "application/json",
          },
          // Wildcard — matches /api/v1/anything, /api/v2/other, etc.
          "GET /api/*": {
            accepts: [
              {
                scheme: "exact",
                price: "$0.001",
                network: "eip155:84532",
                payTo,
              },
            ],
            description: "Premium API access",
            mimeType: "application/json",
          },
        },
        server,
      ),
    );

    app.get("/articles/:slug", (req, res) => {
      res.json({ slug: req.params.slug, content: "Article content..." });
    });

    app.get("/api/*", (req, res) => {
      res.json({ message: "API response" });
    });
    ```
  </Tab>

  <Tab title="Next.js">
    ```typescript  theme={null}
    // proxy.ts
    export const proxy = paymentProxy(
      {
        // Next.js-style param — matches /api/articles/any-slug
        "/api/articles/[slug]": {
          accepts: [
            {
              scheme: "exact",
              price: "$0.01",
              network: "eip155:84532",
              payTo,
            },
          ],
          description: "Read a premium article by slug",
          mimeType: "application/json",
        },
      },
      server,
    );

    export const config = {
      matcher: ["/api/articles/:slug"],
    };
    ```
  </Tab>

  <Tab title="Go (Gin)">
    ```go  theme={null}
    r.Use(ginmw.X402Payment(ginmw.Config{
        Routes: x402http.RoutesConfig{
            // Named param — matches /articles/any-slug
            "GET /articles/:slug": {
                Accepts: x402http.PaymentOptions{
                    {
                        Scheme:   "exact",
                        PayTo:    payTo,
                        Price:    "$0.01",
                        Network:  network,
                    },
                },
                Description: "Read a premium article by slug",
                MimeType:    "application/json",
            },
            // Wildcard — matches /api/v1/anything, /api/v2/other, etc.
            "GET /api/*": {
                Accepts: x402http.PaymentOptions{
                    {
                        Scheme:   "exact",
                        PayTo:    payTo,
                        Price:    "$0.001",
                        Network:  network,
                    },
                },
                Description: "Premium API access",
                MimeType:    "application/json",
            },
        },
        Facilitator: facilitatorClient,
        Schemes: []ginmw.SchemeConfig{
            {Network: network, Server: evm.NewExactEvmScheme()},
        },
        Initialize: true,
        Timeout:    30 * time.Second,
    }))

    r.GET("/articles/:slug", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"slug": c.Param("slug"), "content": "Article content..."})
    })

    r.GET("/api/*path", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"message": "API response"})
    })
    ```
  </Tab>

  <Tab title="Python (FastAPI)">
    ```python  theme={null}
    routes: dict[str, RouteConfig] = {
        # Named param — matches /articles/any-slug
        "GET /articles/:slug": RouteConfig(
            accepts=[
                PaymentOption(
                    scheme="exact",
                    pay_to=pay_to,
                    price="$0.01",
                    network="eip155:84532",
                ),
            ],
            mime_type="application/json",
            description="Read a premium article by slug",
        ),
        # Wildcard — matches /api/v1/anything, /api/v2/other, etc.
        "GET /api/*": RouteConfig(
            accepts=[
                PaymentOption(
                    scheme="exact",
                    pay_to=pay_to,
                    price="$0.001",
                    network="eip155:84532",
                ),
            ],
            mime_type="application/json",
            description="Premium API access",
        ),
    }

    app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)


    @app.get("/articles/{slug}")
    async def get_article(slug: str) -> dict[str, Any]:
        return {"slug": slug, "content": "Article content..."}


    @app.get("/api/{subpath:path}")
    async def get_api(subpath: str) -> dict[str, Any]:
        return {"path": subpath, "message": "API response"}
    ```
  </Tab>

  <Tab title="Python (Flask)">
    ```python  theme={null}
    routes: dict[str, RouteConfig] = {
        # Named param — matches /articles/any-slug
        "GET /articles/:slug": RouteConfig(
            accepts=[
                PaymentOption(
                    scheme="exact",
                    pay_to=pay_to,
                    price="$0.01",
                    network="eip155:84532",
                ),
            ],
            mime_type="application/json",
            description="Read a premium article by slug",
        ),
        # Wildcard — matches /api/v1/anything, /api/v2/other, etc.
        "GET /api/*": RouteConfig(
            accepts=[
                PaymentOption(
                    scheme="exact",
                    pay_to=pay_to,
                    price="$0.001",
                    network="eip155:84532",
                ),
            ],
            mime_type="application/json",
            description="Premium API access",
        ),
    }

    payment_middleware(app, routes=routes, server=server)


    @app.route("/articles/<slug>")
    def get_article(slug: str):
        return jsonify({"slug": slug, "content": "Article content..."})


    @app.route("/api/<path:subpath>")
    def get_api(subpath: str):
        return jsonify({"path": subpath, "message": "API response"})
    ```
  </Tab>
</Tabs>

<Tip>
  When using dynamic routes with [Bazaar discovery](/x402/bazaar), prefer named params (`:param` or `[param]`) over wildcards (`*`). Named params generate cleaner discovery metadata with descriptive parameter names; wildcards auto-generate names like `var1`, `var2`.
</Tip>

### Payment Schemes: Exact vs Upto

x402 supports two payment schemes that control how charges are calculated:

**`exact`** (default) — The client pays the exact advertised price. This is the simplest scheme and works across all networks (EVM, SVM) and all SDKs (TypeScript, Go, Python). Best for fixed-price endpoints where the cost is known upfront.

**`upto`** — The client authorizes a **maximum** amount, but the server settles **only what was actually used**. This enables usage-based billing where the final charge depends on work performed (LLM token count, compute time, bytes served, etc.). Currently available on EVM networks only, in TypeScript and Go SDKs.

The examples in step 2 above all use the `exact` scheme. To use `upto` instead, there are two key differences:

1. Set `scheme: "upto"` in your route config, where `price` becomes the **maximum** the client authorizes
2. Call `setSettlementOverrides` in your handler to specify the **actual** amount to charge

<Tabs>
  <Tab title="Node.js (Express)">
    ```typescript  theme={null}
    import express from "express";
    import { paymentMiddleware, setSettlementOverrides, x402ResourceServer } from "@x402/express";
    import { UptoEvmScheme } from "@x402/evm/upto/server";
    import { HTTPFacilitatorClient } from "@x402/core/server";

    const app = express();
    const payTo = "0xYourAddress";

    const facilitatorClient = new HTTPFacilitatorClient({
      url: "https://x402.org/facilitator"
    });

    const maxPrice = "$0.10"; // Maximum the client authorizes (10 cents)

    app.use(
      paymentMiddleware(
        {
          "GET /api/generate": {
            accepts: [
              {
                scheme: "upto",
                price: maxPrice,
                network: "eip155:84532", // Base Sepolia
                payTo,
              },
            ],
            description: "AI text generation — billed by token usage",
            mimeType: "application/json",
          },
        },
        new x402ResourceServer(facilitatorClient)
          .register("eip155:84532", new UptoEvmScheme()),
      ),
    );

    app.get("/api/generate", (req, res) => {
      const maxAmountAtomic = 100000; // 10 cents in 6-decimal USDC atomic units
      const actualUsage = Math.floor(Math.random() * (maxAmountAtomic + 1));

      // Settle only the actual usage — the client is never charged more than this
      setSettlementOverrides(res, { amount: String(actualUsage) });

      res.json({
        result: "Here is your generated text...",
        usage: {
          authorizedMaxAtomic: String(maxAmountAtomic),
          actualChargedAtomic: String(actualUsage),
        },
      });
    });

    app.listen(4021, () => {
      console.log("Server listening at http://localhost:4021");
    });
    ```
  </Tab>

  <Tab title="Go (Gin)">
    ```go  theme={null}
    package main

    import (
        "fmt"
        "math/rand"
        "net/http"
        "time"

        x402 "github.com/coinbase/x402/go"
        x402http "github.com/coinbase/x402/go/http"
        ginmw "github.com/coinbase/x402/go/http/gin"
        uptoevm "github.com/coinbase/x402/go/mechanisms/evm/upto/server"
        "github.com/gin-gonic/gin"
    )

    func main() {
        payTo := "0xYourAddress"
        network := x402.Network("eip155:84532") // Base Sepolia

        r := gin.Default()

        facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
            URL: "https://x402.org/facilitator",
        })

        maxPrice := "$0.10" // Maximum the client authorizes

        r.Use(ginmw.X402Payment(ginmw.Config{
            Routes: x402http.RoutesConfig{
                "GET /api/generate": {
                    Accepts: x402http.PaymentOptions{
                        {
                            Scheme:  "upto",
                            Price:   maxPrice,
                            Network: network,
                            PayTo:   payTo,
                        },
                    },
                    Description: "AI text generation - billed by token usage",
                    MimeType:    "application/json",
                },
            },
            Facilitator: facilitatorClient,
            Schemes: []ginmw.SchemeConfig{
                {Network: network, Server: uptoevm.NewUptoEvmScheme()},
            },
            Timeout: 30 * time.Second,
        }))

        r.GET("/api/generate", func(c *gin.Context) {
            maxAmountAtomic := 100000 // 10 cents in 6-decimal USDC atomic units
            actualUsage := rand.Intn(maxAmountAtomic + 1)

            // Settle only the actual usage
            ginmw.SetSettlementOverrides(c, &x402.SettlementOverrides{
                Amount: fmt.Sprintf("%d", actualUsage),
            })

            c.JSON(http.StatusOK, gin.H{
                "result": "Here is your generated text...",
                "usage": gin.H{
                    "authorizedMaxAtomic": fmt.Sprintf("%d", maxAmountAtomic),
                    "actualChargedAtomic": fmt.Sprintf("%d", actualUsage),
                },
            })
        })

        r.Run(":4021")
    }
    ```
  </Tab>
</Tabs>

The `setSettlementOverrides` amount supports three formats:

* **Raw atomic units** — e.g., `"1000"` settles exactly 1,000 atomic units of the token (for USDC with 6 decimals, `"1000"` = \$0.001)
* **Percentage of authorized maximum** — e.g., `"50%"` settles 50% of the authorized amount. Supports up to two decimal places (e.g., `"33.33%"`). The result is floored to the nearest atomic unit.
* **Dollar price** — e.g., `"$0.05"` converts a USD-denominated price to atomic units. This format works when you configured your route with `$`-prefixed pricing (e.g., `price: "$0.10"`).

The resolved amount must always be \<= the authorized maximum. If the amount is `"0"`, no on-chain transaction occurs and the client is not charged.

<Note>
  The `upto` scheme is currently available on EVM networks only (TypeScript and Go SDKs). Python does not yet support upto.
</Note>

## 3. Test Your Integration

To verify:

1. Make a request to your endpoint (e.g., `curl http://localhost:4021/weather`).
2. The server responds with a 402 Payment Required, including payment instructions in the `PAYMENT-REQUIRED` header.
3. Complete the payment using a compatible client, wallet, or automated agent. This typically involves signing a payment payload, which is handled by the client SDK detailed in the [Quickstart for Buyers](/x402/quickstart-for-buyers).
4. Retry the request, this time including the `PAYMENT-SIGNATURE` header containing the cryptographic proof of payment.
5. The server verifies the payment via the facilitator and, if valid, returns your actual API response (e.g., `{ "data": "Your paid API response." }`).

## 4. Enhance Discovery with Metadata (Recommended)

When using the CDP facilitator, your endpoints can be listed in the [x402 Bazaar](/x402/bazaar), our discovery layer that helps buyers and AI agents find services. To enable discovery and improve visibility:

<Tip>
  **Include descriptive metadata** in your route configuration:

  * **`description`**: Clear explanation of what your endpoint does
  * **`mimeType`**: MIME type of your response format
  * **`extensions.bazaar`**: Enable Bazaar discovery

  This metadata helps:

  * AI agents automatically understand how to use your API
  * Developers quickly find services that meet their needs
  * Improve your ranking in discovery results
</Tip>

<Note>
  **How Bazaar indexes your resource:** When the CDP Bazaar crawls your endpoint
  for discovery, it sends a request with **no body**. Your server must respond
  with a `402 Payment Required` status to that empty request, confirming the resource
  is x402-enabled. If your server returns any other status code (e.g. `400 Bad
    Request`), the resource will **not** be indexed and will not appear in Bazaar
  search results. Other discovery layers or bazaars may use a different indexing
  mechanism.
</Note>

Example with Bazaar extension:

```typescript  theme={null}
{
  "GET /weather": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.001",
        network: "eip155:8453",
        payTo: "0xYourAddress",
      },
    ],
    description: "Get real-time weather data including temperature, conditions, and humidity",
    mimeType: "application/json",
    extensions: {
      bazaar: {
        discoverable: true,
        category: "weather",
        tags: ["forecast", "real-time"],
      },
    },
  },
}
```

Learn more about the discovery layer in the [x402 Bazaar documentation](/x402/bazaar).

## 5. Accept Any ERC-20 Token with Permit2 (Optional, EVM)

By default, the quickstart above uses USDC via [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) (Transfer With Authorization), which requires no on-chain approval from buyers. To accept **any ERC-20 token**, you can use [Permit2](https://github.com/Uniswap/permit2) as the transfer method.

<Note>
  The official **TypeScript**, **Go**, and **Python** SDKs all have built-in support for both EIP-3009 and Permit2.
</Note>

### How It Works

* Set `extra.assetTransferMethod: "permit2"` in your route's price configuration
* Optionally declare a **gas sponsorship extension** so the facilitator can sponsor the buyer's one-time Permit2 approval on-chain (no gas cost to the buyer)
* Without gas sponsorship, buyers must manually approve the Permit2 contract before their first payment

### Gas Sponsorship Extensions

Gas sponsorship extensions require **facilitator support**. Before declaring a gas sponsorship extension on your endpoint, verify that your facilitator supports it by calling its `/supported` endpoint and inspecting the `extensions` property in the response. Look for:

* `eip2612-gas-sponsoring` — indicates EIP-2612 gas sponsorship support
* `erc20-approval-gas-sponsoring` — indicates ERC-20 approval gas sponsorship support

If these fields are not present, the facilitator does not support the corresponding extension and you should not declare it on your routes.

There are two gas sponsorship extensions, depending on the token:

| Extension                                    | When to Use                                                                                  | Facilitator Extension Key       | Import             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------- | ------------------ |
| `declareEip2612GasSponsoringExtension`       | Token implements [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612) `permit()` (e.g., USDC) | `eip2612-gas-sponsoring`        | `@x402/extensions` |
| `declareErc20ApprovalGasSponsoringExtension` | Generic ERC-20 token without EIP-2612                                                        | `erc20-approval-gas-sponsoring` | `@x402/extensions` |

### Example: Permit2 with EIP-2612 Gas Sponsoring (e.g., USDC)

For tokens that support EIP-2612 (like USDC), declare the EIP-2612 gas sponsoring extension. The facilitator uses a signed `permit()` to approve Permit2 on the buyer's behalf — fully gasless for the buyer.

<Tabs>
  <Tab title="Node.js">
    ```bash  theme={null}
    npm install @x402/extensions
    ```

    ```typescript  theme={null}
    import { declareEip2612GasSponsoringExtension } from "@x402/extensions";
    import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

    // In your route configuration:
    "GET /protected": {
      accepts: {
        payTo: "0xYourAddress",
        scheme: "exact",
        network: "eip155:84532",
        price: "$0.001",
        extra: { assetTransferMethod: "permit2" },
      },
      extensions: {
        ...declareDiscoveryExtension({ /* ... */ }),
        ...declareEip2612GasSponsoringExtension(),
      },
    },
    ```
  </Tab>

  <Tab title="Go">
    In Go, gas sponsorship extensions are declared inline in the route config:

    ```go  theme={null}
    "GET /protected": {
        Accepts: x402http.PaymentOptions{
            {
                Scheme:  "exact",
                PayTo:   payTo,
                Network: network,
                Price: map[string]interface{}{
                    "amount": "1000",
                    "asset":  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                    "extra": map[string]interface{}{
                        "assetTransferMethod": "permit2",
                    },
                },
            },
        },
    },
    ```
  </Tab>

  <Tab title="Python">
    ```python  theme={null}
    from x402.extensions.eip2612_gas_sponsoring import declare_eip2612_gas_sponsoring_extension
    from x402.extensions.bazaar import declare_discovery_extension, OutputConfig

    # In your route configuration:
    routes = {
        "GET /protected": {
            "accepts": {
                "payTo": "0xYourAddress",
                "scheme": "exact",
                "network": "eip155:84532",
                "price": "$0.001",
                "extra": {"assetTransferMethod": "permit2"},
            },
            "extensions": {
                **declare_discovery_extension(
                    output=OutputConfig(
                        example={"message": "Hello, world!"},
                        schema={
                            "properties": {"message": {"type": "string"}},
                            "required": ["message"],
                        },
                    )
                ),
                **declare_eip2612_gas_sponsoring_extension(),
            },
        },
    }
    ```
  </Tab>
</Tabs>

### Example: Permit2 with ERC-20 Gas Sponsoring (Generic Token)

For tokens that do **not** support EIP-2612, use the ERC-20 approval gas sponsoring extension. The facilitator broadcasts a pre-signed `approve()` transaction on the buyer's behalf.

<Tabs>
  <Tab title="Node.js">
    ```typescript  theme={null}
    import { declareErc20ApprovalGasSponsoringExtension } from "@x402/extensions";

    // In your route configuration:
    "GET /protected": {
      accepts: {
        payTo: "0xYourAddress",
        scheme: "exact",
        network: "eip155:84532",
        price: {
          amount: "1000",
          asset: "0xYourTokenAddress",
          extra: {
            assetTransferMethod: "permit2",
          },
        },
      },
      extensions: {
        ...declareErc20ApprovalGasSponsoringExtension(),
      },
    },
    ```
  </Tab>

  <Tab title="Go">
    ```go  theme={null}
    "GET /protected": {
        Accepts: x402http.PaymentOptions{
            {
                Scheme:  "exact",
                PayTo:   payTo,
                Network: network,
                Price: map[string]interface{}{
                    "amount": "1000",
                    "asset":  "0xYourTokenAddress",
                    "extra": map[string]interface{}{
                        "assetTransferMethod": "permit2",
                    },
                },
            },
        },
    },
    ```
  </Tab>

  <Tab title="Python">
    ```python  theme={null}
    from x402.extensions.erc20_approval_gas_sponsoring import (
        declare_erc20_approval_gas_sponsoring_extension,
    )

    # In your route configuration:
    routes = {
        "GET /protected": {
            "accepts": {
                "payTo": "0xYourAddress",
                "scheme": "exact",
                "network": "eip155:84532",
                "price": {
                    "amount": "1000",
                    "asset": "0xYourTokenAddress",
                    "extra": {"assetTransferMethod": "permit2"},
                },
            },
            "extensions": {
                **declare_erc20_approval_gas_sponsoring_extension(),
            },
        },
    }
    ```
  </Tab>
</Tabs>

<Info>
  For full details on EVM transfer methods and gas sponsorship, see [Network Support](/x402/network-support#evm-support-x402evm).
</Info>

## 6. Error Handling

* If you run into trouble, check out the examples in the [repo](https://github.com/coinbase/x402/tree/main/examples) for more context and full code.
* Run `npm install` or `go mod tidy` to install dependencies

## Running on Mainnet

Once you've tested your integration on testnet, you're ready to accept real payments on mainnet.

### Setting Up CDP Facilitator for Production

CDP's facilitator provides enterprise-grade payment processing with compliance features:

<Frame>
  <iframe width="560" height="315" src="https://www.youtube.com/embed/Zc_wBlDY2Zc" title="Running x402 on Mainnet" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="rounded-lg w-full" />
</Frame>

### 1. Set up CDP API Keys

To use the mainnet facilitator, you'll need a Coinbase Developer Platform account:

1. Sign up at [cdp.coinbase.com](https://cdp.coinbase.com)
2. Create a new project
3. Generate API credentials
4. Set the following environment variables:
   ```bash  theme={null}
   CDP_API_KEY_ID=your-api-key-id
   CDP_API_KEY_SECRET=your-api-key-secret
   ```

### 2. Update Your Code

Replace the testnet configuration with mainnet settings:

<Tabs>
  <Tab title="Node.js">
    ```typescript  theme={null}
    import { paymentMiddleware, x402ResourceServer } from "@x402/express";
    import { ExactEvmScheme } from "@x402/evm/exact/server";
    import { HTTPFacilitatorClient } from "@x402/core/server";
    import { facilitator } from "@coinbase/x402";

    const facilitatorClient = new HTTPFacilitatorClient(facilitator);

    const server = new x402ResourceServer(facilitatorClient)
      .register("eip155:8453", new ExactEvmScheme()); // Base mainnet

    app.use(
      paymentMiddleware(
        {
          "GET /weather": {
            accepts: [
              {
                scheme: "exact",
                price: "$0.001",
                network: "eip155:8453", // Base mainnet (CAIP-2)
                payTo: "0xYourAddress",
              },
            ],
            description: "Weather data",
            mimeType: "application/json",
          },
        },
        server,
      ),
    );
    ```
  </Tab>

  <Tab title="Go">
    ```go  theme={null}
    // Update network to mainnet
    network := x402.Network("eip155:8453") // Base mainnet (CAIP-2)

    // Create facilitator client for mainnet (CDP)
    facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
        URL: "https://api.cdp.coinbase.com/platform/v2/x402",
        // CDP requires API key authentication. Pass an AuthProvider that adds
        // CDP_API_KEY_ID and CDP_API_KEY_SECRET as auth headers.
        // For a complete working example with CDP auth, see:
        // https://github.com/coinbase/x402/tree/main/go/legacy/examples/mainnet
    })

    r.Use(ginmw.X402Payment(ginmw.Config{
        Routes: x402http.RoutesConfig{
            "GET /weather": {
                Accepts: x402http.PaymentOptions{
                    {Scheme: "exact", PayTo: payTo, Price: "$0.001", Network: network},
                },
                Description: "Get weather data for a city",
                MimeType:    "application/json",
            },
        },
        Facilitator: facilitatorClient,
        Schemes: []ginmw.SchemeConfig{
            {Network: network, Server: evm.NewExactEvmScheme()},
        },
        Timeout: 30 * time.Second,
    }))
    ```

    <Tip>
      **CDP auth for Go:** The CDP facilitator requires API key authentication. For a complete working Go mainnet example with CDP auth (including env vars and the auth package), see the [mainnet example in the x402 repo](https://github.com/coinbase/x402/tree/main/go/legacy/examples/mainnet).
    </Tip>
  </Tab>

  <Tab title="Python (FastAPI)">
    ```python  theme={null}
    from x402.http import FacilitatorConfig, HTTPFacilitatorClient

    facilitator = HTTPFacilitatorClient(
        FacilitatorConfig(url="https://api.cdp.coinbase.com/platform/v2/x402")
    )
    ```
  </Tab>

  <Tab title="Python (Flask)">
    ```python  theme={null}
    from x402.http import FacilitatorConfig, HTTPFacilitatorClientSync

    facilitator = HTTPFacilitatorClientSync(
        FacilitatorConfig(url="https://api.cdp.coinbase.com/platform/v2/x402")
    )
    ```
  </Tab>
</Tabs>

### 3. Update Your Wallet

Make sure your receiving wallet address is a real mainnet address where you want to receive USDC payments.

### 4. Test with Real Payments

Before going live:

1. Test with small amounts first
2. Verify payments are arriving in your wallet
3. Monitor the facilitator for any issues

<Warning>
  Mainnet transactions involve real money. Always test thoroughly on testnet
  first and start with small amounts on mainnet.
</Warning>

### Using Different Networks

CDP facilitator supports multiple networks. Simply change the network parameter using CAIP-2 format:

<Tabs>
  <Tab title="Base Network">
    ```typescript  theme={null}
    // Base mainnet
    {
      scheme: "exact",
      price: "$0.001",
      network: "eip155:8453", // Base mainnet
      payTo: "0xYourAddress",
    }

    // Base Sepolia testnet
    {
      scheme: "exact",
      price: "$0.001",
      network: "eip155:84532", // Base Sepolia
      payTo: "0xYourAddress",
    }
    ```
  </Tab>

  <Tab title="Polygon Network">
    ```typescript  theme={null}
    // Polygon mainnet
    {
      scheme: "exact",
      price: "$0.001",
      network: "eip155:137", // Polygon mainnet
      payTo: "0xYourAddress",
    }
    ```
  </Tab>

  <Tab title="Solana Network">
    ```typescript  theme={null}
    // Solana mainnet
    {
      scheme: "exact",
      price: "$0.001",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", // Solana mainnet
      payTo: "YourSolanaWalletAddress",
    }

    // Solana devnet
    {
      scheme: "exact",
      price: "$0.001",
      network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", // Solana devnet
      payTo: "YourSolanaWalletAddress",
    }
    ```

    <Note>
      For Solana, make sure to use a Solana wallet address (base58 format) instead of an Ethereum address (0x format).
    </Note>
  </Tab>

  <Tab title="Multi-Network">
    ```typescript  theme={null}
    // Support multiple networks on the same endpoint
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "eip155:8453",
            payTo: "0xYourEvmAddress",
          },
          {
            scheme: "exact",
            price: "$0.001",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            payTo: "YourSolanaAddress",
          },
        ],
        description: "Weather data",
      },
    }
    ```
  </Tab>
</Tabs>

<Info>
  Need support for additional networks like Avalanche? You can run your own
  facilitator or contact CDP support to request new network additions.
</Info>

## Network Identifiers (CAIP-2)

x402 v2 uses [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) format for network identifiers:

| Network        | CAIP-2 Identifier                         |
| -------------- | ----------------------------------------- |
| Base Mainnet   | `eip155:8453`                             |
| Base Sepolia   | `eip155:84532`                            |
| Polygon        | `eip155:137`                              |
| Arbitrum       | `eip155:42161`                            |
| World          | `eip155:480`                              |
| Solana Mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Solana Devnet  | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |

See [Network Support](/x402/network-support) for the full list.

## Next Steps

* Looking for something more advanced? Check out the [Advanced Example](https://github.com/coinbase/x402/tree/main/examples/typescript/servers/advanced)
* Get started as a [buyer](/x402/quickstart-for-buyers)
* Learn about the [Bazaar discovery layer](/x402/bazaar)

For questions or support, join our [Discord](https://discord.gg/cdp).

## Summary

This quickstart covered:

* Installing the x402 SDK and relevant middleware
* Adding payment middleware to your API and configuring it with static and dynamic route patterns
* Choosing between `exact` (fixed-price) and `upto` (usage-based) payment schemes
* Testing your integration
* Deploying to mainnet with CAIP-2 network identifiers

Your API is now ready to accept crypto payments through x402.
