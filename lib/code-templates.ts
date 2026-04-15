export type Stack = "node" | "go" | "python";

export interface EndpointConfig {
  method: string;
  path: string;
  description: string;
  price: string;
  network: string;
  payTo: string;
  outputExample: string;
  outputSchema: string;
  inputExample: string;
  inputSchema: string;
  bodyType: string;
}

export const INSTALL_COMMANDS: Record<Stack, string> = {
  node: "npm install @x402/express @x402/core @x402/evm @x402/extensions",
  go: "go get github.com/coinbase/x402/go/...",
  python: 'pip install "x402[fastapi]"',
};

export const STACK_LABELS: Record<Stack, string> = {
  node: "Node.js (Express)",
  go: "Go (Gin)",
  python: "Python (FastAPI)",
};

export function generateCode(stack: Stack, config: EndpointConfig): string {
  switch (stack) {
    case "node":
      return generateNodeCode(config);
    case "go":
      return generateGoCode(config);
    case "python":
      return generatePythonCode(config);
  }
}

function generateNodeCode(c: EndpointConfig): string {
  const isBodyMethod = ["POST", "PUT", "PATCH"].includes(c.method);

  const discoveryArgs = isBodyMethod
    ? `{
            bodyType: "json",
            input: ${c.inputExample || "{}"},
            inputSchema: ${c.inputSchema || "{}"},
            output: {
              example: ${c.outputExample || "{}"},
              schema: ${c.outputSchema || "{}"},
            },
          }`
    : `{${c.inputExample ? `
            input: ${c.inputExample},
            inputSchema: ${c.inputSchema},` : ""}
            output: {
              example: ${c.outputExample || "{}"},
              schema: ${c.outputSchema || "{}"},
            },
          }`;

  return `import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";

const app = express();

// Create facilitator client
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://api.cdp.coinbase.com/platform/v2/x402/facilitator",
});

// Create resource server and register extensions
const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);
server.registerExtension(bazaarResourceServerExtension);

// Configure payment middleware with discovery metadata
app.use(
  paymentMiddleware(
    {
      "${c.method} ${c.path}": {
        accepts: {
          scheme: "exact",
          price: "${c.price}",
          network: "${c.network}",
          payTo: "${c.payTo}",
        },
        extensions: {
          ...declareDiscoveryExtension(${discoveryArgs}),
        },
      },
    },
    server,
  ),
);

app.${c.method.toLowerCase()}("${c.path}", (req, res) => {
  // Your endpoint logic here
  res.json(${c.outputExample || "{}"});
});

app.listen(4021);`;
}

function generateGoCode(c: EndpointConfig): string {
  const isBodyMethod = ["POST", "PUT", "PATCH"].includes(c.method);
  const methodConst = `types.Method${c.method}`;

  const inputArgs = isBodyMethod
    ? `nil, // No query params
            ${c.inputSchema ? `&types.JSONSchema${c.inputSchema}` : "nil"}, // Input schema
            "${c.bodyType || "json"}", // Body type`
    : `nil, // No query params
            nil, // No input schema
            "",  // Not a body method`;

  return `package main

import (
    "net/http"

    x402 "github.com/coinbase/x402/go"
    x402http "github.com/coinbase/x402/go/http"
    ginmw "github.com/coinbase/x402/go/http/gin"
    evm "github.com/coinbase/x402/go/mechanisms/evm/exact/server"
    "github.com/coinbase/x402/go/extensions/bazaar"
    "github.com/coinbase/x402/go/extensions/types"
    "github.com/gin-gonic/gin"
)

func main() {
    r := gin.Default()

    // Create discovery extension for the endpoint
    discoveryExt, _ := bazaar.DeclareDiscoveryExtension(
        ${methodConst},
        ${inputArgs}
        &types.OutputConfig{
            Example: map[string]interface{}${c.outputExample || "{}"},
            Schema: types.JSONSchema${c.outputSchema || "{}"},
        },
    )

    r.Use(ginmw.X402Payment(ginmw.Config{
        Routes: x402http.RoutesConfig{
            "${c.method} ${c.path}": {
                Scheme:  "exact",
                PayTo:   "${c.payTo}",
                Price:   "${c.price}",
                Network: x402.Network("${c.network}"),
                Extensions: map[string]interface{}{
                    types.BAZAAR: discoveryExt,
                },
            },
        },
        Facilitator: x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
            URL: "https://api.cdp.coinbase.com/platform/v2/x402/facilitator",
        }),
        Schemes: []ginmw.SchemeConfig{
            {Network: x402.Network("${c.network}"), Server: evm.NewExactEvmScheme()},
        },
    }))

    r.${c.method}("/weather", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H${c.outputExample || `{"status": "ok"}`})
    })

    r.Run(":4021")
}`;
}

function generatePythonCode(c: EndpointConfig): string {
  const inputBlock =
    c.inputExample && ["POST", "PUT", "PATCH"].includes(c.method)
      ? `
                    "input": {
                        "type": "http",
                        "method": "${c.method}",
                        "bodyType": "${c.bodyType || "json"}",
                        "bodyFields": ${c.inputSchema || "{}"},
                    },`
      : "";

  return `from typing import Any

from fastapi import FastAPI

from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.http.types import RouteConfig
from x402.mechanisms.evm.exact import ExactEvmServerScheme
from x402.server import x402ResourceServer

app = FastAPI()

pay_to = "${c.payTo}"

facilitator = HTTPFacilitatorClient(
    FacilitatorConfig(url="https://api.cdp.coinbase.com/platform/v2/x402/facilitator")
)

server = x402ResourceServer(facilitator)
server.register("${c.network}", ExactEvmServerScheme())

# Define protected routes with discovery metadata
routes: dict[str, RouteConfig] = {
    "${c.method} ${c.path}": RouteConfig(
        accepts=[
            PaymentOption(
                scheme="exact",
                pay_to=pay_to,
                price="${c.price}",
                network="${c.network}",
            ),
        ],
        mime_type="application/json",
        description="${c.description}",
        extensions={
            "bazaar": {
                "info": {${inputBlock}
                    "output": {
                        "type": "json",
                        "example": ${c.outputExample || "{}"},
                    },
                },
            },
        },
    ),
}

app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)


@app.${c.method.toLowerCase()}("${c.path}")
async def handler() -> dict[str, Any]:
    return ${c.outputExample || "{}"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4021)`;
}

export function generateTestPaymentCode(
  stack: Stack,
  url: string,
  method: string
): string {
  switch (stack) {
    case "node":
      return `// See the x402 buyer quickstart:
// https://github.com/coinbase/x402/tree/main/examples/typescript/clients

import { wrapFetchWithPayment } from "@x402/fetch";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const account = privateKeyToAccount("0xYOUR_PRIVATE_KEY");
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);

const response = await fetchWithPayment("${url}", {
  method: "${method}",
});
console.log("Response:", await response.json());`;

    case "go":
      return `// See the x402 Go buyer quickstart:
// https://github.com/coinbase/x402/tree/main/examples/go/client

// 1. Make an unauthenticated request to get payment requirements:
//    curl -i ${url}
//
// 2. The 402 response will include payment requirements in the accepts array
// 3. Construct and sign a payment, then resend with the X-PAYMENT header
//
// For a complete Go client example, see the x402 Go SDK documentation.`;

    case "python":
      return `# See the x402 Python buyer quickstart:
# https://github.com/coinbase/x402/tree/main/examples/python/clients

from x402.client import create_x402_client
from eth_account import Account

# Create a wallet
account = Account.from_key("0xYOUR_PRIVATE_KEY")

# Create an x402-enabled HTTP client
client = create_x402_client(account, network="base-sepolia")

# Make a paid request to your endpoint
response = client.${method.toLowerCase()}("${url}")
print("Response:", response.json())`;
  }
}
