"use client";

import { cn } from "@/lib/utils";
import { generateSchemaFromExample } from "@/lib/schemas";

interface StepMetadataProps {
  outputExample: string;
  outputSchema: string;
  inputExample: string;
  inputSchema: string;
  bodyType: string;
  method: string;
  // Probed endpoint description (from resource.description in the 402
  // response). Shown as a hint above the Output Example field so the user
  // remembers what their own endpoint does.
  probedDescription?: string;
  // The endpoint URL being fixed — surfaced in the help copy so the user
  // knows which URL to curl if they need to discover their own response shape.
  endpointUrl?: string;
  onChange: (field: string, value: string) => void;
}

const textareaClass = cn(
  "w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground",
  "placeholder:text-muted-foreground",
  "focus:outline-none focus:ring-1 focus:ring-accent",
  "resize-y min-h-[100px]"
);

export function StepMetadata({
  outputExample,
  outputSchema,
  inputExample,
  inputSchema,
  bodyType,
  method,
  probedDescription,
  endpointUrl,
  onChange,
}: StepMetadataProps) {
  const handleOutputExampleChange = (value: string) => {
    onChange("outputExample", value);
    const schema = generateSchemaFromExample(value);
    onChange("outputSchema", schema);
  };

  const handleInputExampleChange = (value: string) => {
    onChange("inputExample", value);
    if (value.trim()) {
      const schema = generateSchemaFromExample(value);
      onChange("inputSchema", schema);
    }
  };

  const showInput = method === "POST" || method === "PUT";

  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium">Define discovery metadata</h3>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Output Example (JSON — what your endpoint returns)
        </label>
        {probedDescription && (
          <div className="bg-muted/50 border border-border/50 rounded-md px-3 py-2 mb-2 text-xs">
            <span className="text-muted-foreground">Your endpoint says: </span>
            <span className="text-foreground italic">&ldquo;{probedDescription}&rdquo;</span>
          </div>
        )}
        <textarea
          value={outputExample}
          onChange={(e) => handleOutputExampleChange(e.target.value)}
          placeholder='{"temperature": 72, "unit": "fahrenheit", "location": "San Francisco"}'
          className={textareaClass}
        />
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          What JSON does this endpoint return when paid? If you don&apos;t know,
          hit it once with{" "}
          <code className="font-mono text-foreground/80">curl</code>{" "}
          {endpointUrl ? (
            <>
              (e.g.{" "}
              <code className="font-mono text-foreground/80">
                curl {endpointUrl}
              </code>
              ){" "}
            </>
          ) : null}
          after a paid request.
        </p>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Output Schema (auto-generated, editable)
        </label>
        <textarea
          value={outputSchema}
          onChange={(e) => onChange("outputSchema", e.target.value)}
          className={textareaClass}
        />
      </div>

      {showInput && (
        <>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Body Type
            </label>
            <select
              value={bodyType}
              onChange={(e) => onChange("bodyType", e.target.value)}
              className={cn(
                "w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground",
                "focus:outline-none focus:ring-1 focus:ring-accent"
              )}
            >
              <option value="json">JSON</option>
              <option value="text">Text</option>
              <option value="binary">Binary</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Input Example (optional — request body)
            </label>
            <textarea
              value={inputExample}
              onChange={(e) => handleInputExampleChange(e.target.value)}
              placeholder='{"location": "San Francisco"}'
              className={textareaClass}
            />
          </div>

          {inputExample.trim() && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Input Schema (auto-generated, editable)
              </label>
              <textarea
                value={inputSchema}
                onChange={(e) => onChange("inputSchema", e.target.value)}
                className={textareaClass}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
