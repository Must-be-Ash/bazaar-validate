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
  node: "npm install x402-express",
  go: 'go get github.com/coinbase/x402/go/pkg/gin',
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
  const outputBlock = c.outputExample
    ? `
        outputSchema: ${c.outputSchema},`
    : "";

  return `import express from "express";
import { paymentMiddleware } from "x402-express";

const app = express();

app.use(
  paymentMiddleware(
    "${c.payTo}",
    {
      "${c.method} ${c.path}": {
        price: "${c.price}",
        network: "${c.network}",
        config: {
          description: "${c.description}",${outputBlock}
        },
      },
    },
    {
      url: "https://api.cdp.coinbase.com/platform/v2/x402/facilitator",
    },
  ),
);

app.${c.method.toLowerCase()}("${c.path}", (req, res) => {
  // Your endpoint logic here
  res.json(${c.outputExample || "{}"});
});

app.listen(4021, () => {
  console.log("Server listening at http://localhost:4021");
});`;
}

function generateGoCode(c: EndpointConfig): string {
  const outputSchemaLine = c.outputSchema
    ? `
		x402gin.WithOutputSchema(&outputSchema),`
    : "";

  const outputSchemaVar = c.outputSchema
    ? `
	outputSchema := json.RawMessage(\`${c.outputSchema}\`)
`
    : "";

  return `package main

import (
	"encoding/json"
	"math/big"

	x402gin "github.com/coinbase/x402/go/pkg/gin"
	"github.com/coinbase/x402/go/pkg/types"
	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	facilitatorConfig := &types.FacilitatorConfig{
		URL: "https://api.cdp.coinbase.com/platform/v2/x402/facilitator",
	}
${outputSchemaVar}
	r.${c.method}(
		"${c.path}",
		x402gin.PaymentMiddleware(
			big.NewFloat(${parsePriceToFloat(c.price)}),
			"${c.payTo}",
			x402gin.WithFacilitatorConfig(facilitatorConfig),
			x402gin.WithDescription("${c.description}"),${outputSchemaLine}
		),
		func(c *gin.Context) {
			c.JSON(200, ${c.outputExample ? `json.RawMessage(\`${c.outputExample}\`)` : `gin.H{"status": "ok"}`})
		},
	)

	r.Run(":4021")
	_ = json.RawMessage{}
}`;
}

function generatePythonCode(c: EndpointConfig): string {
  const outputSchemaLine = c.outputSchema
    ? `
        output_schema=${c.outputSchema},`
    : "";

  const inputSchemaBlock =
    c.inputExample && (c.method === "POST" || c.method === "PUT")
      ? `
        input_schema=HTTPInputSchema(
            body_type="${c.bodyType}",
            body_fields=${c.inputSchema || "{}"},
        ),`
      : "";

  const importInputSchema =
    c.inputExample && (c.method === "POST" || c.method === "PUT")
      ? "\nfrom x402.types import HTTPInputSchema"
      : "";

  return `from fastapi import FastAPI
from x402.fastapi.middleware import require_payment${importInputSchema}

app = FastAPI()

app.middleware("http")(
    require_payment(
        price="${c.price}",
        pay_to_address="${c.payTo}",
        path="${c.path}",
        network="${c.network}",
        description="${c.description}",${outputSchemaLine}${inputSchemaBlock}
        facilitator_config={"url": "https://api.cdp.coinbase.com/platform/v2/x402/facilitator"},
    )
)

@app.${c.method.toLowerCase()}("${c.path}")
async def handler():
    return ${c.outputExample || "{}"}`;
}

function parsePriceToFloat(price: string): string {
  // Convert "$0.001" to "0.001"
  const cleaned = price.replace(/^\$/, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? "0.001" : String(num);
}

export function generateTestPaymentCode(
  stack: Stack,
  url: string,
  method: string
): string {
  switch (stack) {
    case "node":
      return `// Install: npm install x402
import { wrapFetchWithPayment } from "x402";
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
      return `// Use curl or any HTTP client to test the x402 flow:
// 1. First, make an unauthenticated request to get payment requirements:
//    curl -i ${url}
//
// 2. The 402 response will include payment requirements
// 3. Construct and sign a payment, then send with X-PAYMENT header
//
// For a Go client, see the x402 Go SDK documentation.`;

    case "python":
      return `# Install: pip install x402
from x402.client import create_x402_client
from eth_account import Account

# Create a wallet (or use an existing private key)
account = Account.from_key("0xYOUR_PRIVATE_KEY")

# Create an x402-enabled HTTP client
client = create_x402_client(account, network="base-sepolia")

# Make a paid request to your endpoint
response = client.${method.toLowerCase()}("${url}")
print("Response:", response.json())`;
  }
}
