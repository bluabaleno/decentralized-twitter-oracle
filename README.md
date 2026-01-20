# Decentralized Twitter Oracle

**Stop worrying about X API bans. Let Chainlink's decentralized network handle it.**

## The Problem

Building applications that rely on X (Twitter) data is fragile:

- **Rate limits** - Your app stops working when you hit the ceiling
- **API key bans** - One policy violation and your service goes dark
- **Single point of failure** - Centralized API access = centralized risk
- **Cost** - $100+/month for basic access, per key

If you're building a prediction market, social analytics tool, or any app that needs reliable X data, you're one ban away from disaster.

## The Solution

This project uses **Chainlink Runtime Environment (CRE)** to decentralize X API access:

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Application                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 Chainlink DON (21+ nodes)                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Node 1  │  │ Node 2  │  │ Node 3  │  │  ...    │        │
│  │ API Key │  │ API Key │  │ API Key │  │         │        │
│  │    A    │  │    B    │  │    C    │  │         │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └─────────┘        │
│       │            │            │                           │
│       └────────────┼────────────┘                           │
│                    ▼                                        │
│            ┌──────────────┐                                 │
│            │  Consensus   │  ← BFT agreement on results    │
│            └──────────────┘                                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
                   Verified Result
```

**How it helps:**

- **Distributed keys** - Each node operator can use their own X API key
- **Consensus** - Results are aggregated; some nodes failing doesn't break the system
- **Resilience** - If one key gets banned, the network continues with others
- **Trustless** - No single party controls the data feed

## Quick Start

### Prerequisites

- [CRE CLI](https://github.com/smartcontractkit/chainlink-cre) v1.0.5+
- [Bun](https://bun.sh/) runtime

### Setup

```bash
# Clone this repo
git clone https://github.com/YOUR_USERNAME/decentralized-twitter-oracle.git
cd decentralized-twitter-oracle

# Install dependencies
bun install

# Configure your X API token
cp workflow/secrets.example.json workflow/secrets.json
# Edit workflow/secrets.json with your bearer token
```

### Run Simulation

```bash
# Run locally (simulates 2 DON nodes)
cre workflow simulate ./workflow -T local-simulation
```

You'll see output like:

```
╔════════════════════════════════════════════════════════════╗
║           MENTION MARKET - Checking Mentions               ║
╚════════════════════════════════════════════════════════════╝
[CONFIG] Searching for: chainlink, $LINK
[FETCH] Fetching mentions from X API...
────────────────────────────────────────────────────────────
[RESULTS] Mention counts:
  • "chainlink": 156 mentions
  • "$LINK": 82 mentions
  ─────────────────────────
  TOTAL: 238 mentions
────────────────────────────────────────────────────────────
```

## How It Works

### 1. Workflow Definition (`workflow/index.ts`)

The workflow fetches mention counts for configured search terms:

```typescript
// Each node independently fetches from X API
const searchResults = httpClient
  .sendRequest(runtime, fetchAllMentions, consensusMedianAggregation())(config)
  .result();
```

### 2. Consensus Aggregation

CRE's `consensusMedianAggregation()` ensures:
- Each node fetches data independently
- Results are compared across nodes
- Outliers (from failed/banned keys) are excluded
- Final result requires majority agreement

### 3. On-Chain Reporting (Optional)

Results can be written to a smart contract:

```solidity
// MentionRegistry.sol
function reportMentions(bytes32 termHash, uint256 count, uint256 timestamp) external;
```

## Configuration

Edit `workflow/config.json`:

```json
{
  "schedule": "0 */5 * * * *",
  "search": {
    "terms": ["chainlink", "$LINK"],
    "windowMinutes": 60,
    "apiType": "twitter"
  }
}
```

## Use Cases

- **Prediction Markets** - Settle bets on whether @elonmusk mentions $DOGE
- **Social Analytics** - Track brand mentions with decentralized verification
- **Reputation Systems** - Monitor influencer activity without central trust
- **Alert Systems** - Trigger on-chain actions based on social signals

## Current Limitations

- **5 HTTP calls per workflow** - CRE limit means max 5 search terms
- **Local simulation uses 2 nodes** - Production DON has 21+ nodes
- **X API costs** - Each node operator needs their own API access

## Next Steps

This is a proof of concept. Future work:

- [ ] Community key pool with encrypted secrets
- [ ] Incentive mechanism for key providers
- [ ] Alternative data sources (Google Search via Gemini, aggregators)
- [ ] Production deployment on Chainlink mainnet

## License

MIT
