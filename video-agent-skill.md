---
name: video-agent
description: >
  Generate videos from tweets, blog posts, or text prompts using the Video Agent API.
  Use when you want to create short-form video content (10-120 seconds) with AI avatars,
  motion graphics, image slideshows, or voice narration. Pays with USDC on Base via x402.
---

# Video Agent — AI Video Generation

Generate short-form videos from tweets, blog posts, or text prompts. Supports multiple modes: motion graphics with avatar, avatar-only commentary, image slideshows, and voice-only narration.

## Overview

| Property | Value |
|----------|-------|
| Base URL | `https://video-agent.fly.dev` |
| Payment | USDC on Base (eip155:8453) via x402 |
| Generate from Tweet | `POST /api/video/tweet` |
| Generate from URL | `POST /api/video/url` |
| Generate from Spec | `POST /api/video/confirm` |
| Chat to Build Spec | `POST /api/chat` ($0.01/turn) |
| Poll Job Status | `GET /api/job/{id}` (free) |
| Download Video | `GET /api/job/{id}/download` (free) |
| Agent JSON Docs | `GET /api/agent` (free) |

## Quick Start

### 1. Authenticate Wallet

```bash
npx awal@2.0.3 auth login <email>
npx awal@2.0.3 auth verify <flowId> <otp>
npx awal@2.0.3 status  # Confirm authenticated
```

### 2. Generate a Video

```bash
# Avatar-only video from a tweet (~$0.63 for 15s)
npx awal@2.0.3 x402 pay \
  'https://video-agent.fly.dev/api/video/tweet?duration=15&avatar=true&mode=avatar-only' \
  -X POST \
  -d '{"tweet_url":"https://x.com/CoinbaseDev/status/123","duration":15,"mode":"avatar-only","style":"panda"}'
```

Response:
```json
{
  "job_id": "uuid",
  "poll_url": "/api/job/uuid"
}
```

### 3. Poll Until Complete

```bash
# Poll every 10 seconds
curl -s https://video-agent.fly.dev/api/job/<job_id>
```

Status progression: `queued` → `fetching_content` → `writing_script` → `rendering_scenes` → `generating_avatar` → `compositing` → `uploading` → `completed`

### 4. Download Video

```bash
curl -s https://video-agent.fly.dev/api/job/<job_id>/download
```

Response:
```json
{
  "job_id": "uuid",
  "status": "completed",
  "video_url": "https://tmpfiles.org/dl/12345/final.mp4",
  "duration": 15,
  "expires_at": "2026-04-08T18:00:00.000Z"
}
```

## Video Modes

### full (default)
Motion graphics + optional avatar. Remotion renders animated scenes (titles, bullets, gradients). Best for tweets, blog posts, announcements.

### avatar-only
Just the avatar talking. No motion graphics. Cheapest mode with avatar. Best for quick commentary or reactions. Default layout is `fullscreen`.

### slides
Image slideshow with crossfade/pan/zoom transitions and caption overlays. Requires `images[]` array. Optional avatar overlay. Best for product demos, UI walkthroughs.

### voice-only
Motion graphics with narration audio, no avatar. Cheapest overall. Same visuals as `full` but without the HeyGen avatar step.

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | string | `"full"` | `full`, `avatar-only`, `slides`, `voice-only` |
| `duration` | number | `15` | Video length in seconds (10-120) |
| `avatar` | boolean | `true` | Include avatar. Forced `true` for avatar-only, `false` for voice-only |
| `layout` | string | `"split"` | `split` (left 1/3), `pip` (bottom-right), `fullscreen` |
| `style` | string | `"panda"` | `panda` (CDP Panda) or `presenter` (Armando) |
| `scale` | string | `"1920x1080"` | `1920x1080`, `1080x1080`, `1080x1920` |
| `images` | string[] | — | Image URLs for slides mode (required, max 10) |
| `focus` | string | — | What to emphasize in the video |
| `tweet_url` | string | — | Required for `/api/video/tweet` |
| `url` | string | — | Required for `/api/video/url` |
| `source_type` | string | — | `tweet`, `url`, or `chat` (for `/api/video/confirm`) |

**Important**: Query params must match body params for correct x402 pricing (`duration`, `avatar`, `mode`).

## Pricing (USDC)

Formula: `(base_cost * mode_multiplier + per_second_cost * duration) * 1.15`

| Source | Base Cost |
|--------|-----------|
| tweet | $0.24 |
| url | $0.19 |
| chat | $0.18 |

| Mode | Multiplier | Per-second (avatar) | Per-second (no avatar) |
|------|-----------|--------------------|-----------------------|
| full | 1.0x | $0.043 | $0.003 |
| avatar-only | 0.6x | $0.040 | $0.040 |
| slides | 0.8x | $0.035 | $0.002 |
| voice-only | 0.7x | $0.003 | $0.003 |

**Example prices (15 seconds):**
- full + avatar + tweet: ~$0.78
- avatar-only + tweet: ~$0.63
- voice-only + tweet: ~$0.24
- slides + avatar + url: ~$0.79

Chat: $0.01 per message.

## Chat Flow

Use `/api/chat` for a guided conversation to build a video spec:

```bash
# Turn 1
npx awal@2.0.3 x402 pay 'https://video-agent.fly.dev/api/chat' \
  -X POST -d '{"message":"Make a video about this tweet https://x.com/..."}'

# Turn 2+ (include session_id)
npx awal@2.0.3 x402 pay 'https://video-agent.fly.dev/api/chat' \
  -X POST -d '{"message":"Make it avatar-only with panda style","session_id":"<session_id>"}'
```

When `ready: true`, use the returned `spec` object as the body for `POST /api/video/confirm`.

## Usage with @x402/fetch (Node.js)

```typescript
import { wrapFetch } from "@x402/fetch";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const account = privateKeyToAccount("0x...");
const wallet = createWalletClient({ account, chain: base, transport: http() });
const x402fetch = wrapFetch(fetch, wallet);

// Submit job
const res = await x402fetch(
  "https://video-agent.fly.dev/api/video/tweet?duration=15&avatar=true&mode=avatar-only",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tweet_url: "https://x.com/CoinbaseDev/status/123",
      duration: 15,
      mode: "avatar-only",
      style: "panda",
    }),
  }
);

const { job_id, poll_url } = await res.json();

// Poll until done (every 10 seconds)
let status = "queued";
while (status !== "completed" && status !== "failed") {
  await new Promise((r) => setTimeout(r, 10000));
  const poll = await fetch(`https://video-agent.fly.dev${poll_url}`);
  const data = await poll.json();
  status = data.status;
  console.log(`Status: ${status} (${data.progress}%)`);
}

// Download
const dl = await fetch(`https://video-agent.fly.dev/api/job/${job_id}/download`);
const { video_url } = await dl.json();
console.log("Video:", video_url);
```

## Examples

### Full video from a URL
```bash
npx awal@2.0.3 x402 pay \
  'https://video-agent.fly.dev/api/video/url?duration=20&avatar=true&mode=full' \
  -X POST \
  -d '{"url":"https://example.com/blog","duration":20,"mode":"full","style":"panda","layout":"split"}'
```

### Slides from images
```bash
npx awal@2.0.3 x402 pay \
  'https://video-agent.fly.dev/api/video/confirm?source_type=chat&duration=15&avatar=true&mode=slides' \
  -X POST \
  -d '{"source_type":"chat","focus":"Product walkthrough","duration":15,"mode":"slides","avatar":true,"style":"panda","images":["https://example.com/img1.png","https://example.com/img2.png","https://example.com/img3.png"]}'
```

### Voice-only (cheapest)
```bash
npx awal@2.0.3 x402 pay \
  'https://video-agent.fly.dev/api/video/tweet?duration=15&avatar=false&mode=voice-only' \
  -X POST \
  -d '{"tweet_url":"https://x.com/CoinbaseDev/status/123","duration":15,"mode":"voice-only","style":"panda"}'
```

## Important Notes

- Videos take 2-5 minutes to generate depending on mode and duration
- `avatar-only` is fastest (no Remotion rendering)
- `voice-only` skips HeyGen avatar generation (saves ~1-2 min)
- Video URLs expire after 24 hours
- Poll `/api/job/{id}` every 10 seconds — do not poll faster
- Max 10 images for slides mode
- Duration is clamped to 10-120 seconds