# Mention Market Spec

## Overview

A prediction market where users bet on whether a specific X handle will mention a term/handle within a time window. Powered by Chainlink CRE for decentralized settlement.

**Example market:** "Will @elonmusk mention $DOGE before Jan 31, 2026 midnight UTC?"

## Design Decisions

- **Market type:** Binary (yes/no)
- **Creation:** Allowlist (approved addresses only)
- **Settlement:** Fixed end time

---

## Components

### 1. Smart Contract: `MentionMarket.sol`

```
State:
- markets: mapping(uint256 => Market)
- marketCreators: mapping(address => bool)  // allowlist
- nextMarketId: uint256

Market struct:
- id: uint256
- sourceHandle: string      // e.g., "elonmusk"
- targetTerm: string        // e.g., "$DOGE" or "@chainlink"
- endTime: uint256          // unix timestamp
- resolved: bool
- outcome: bool             // true = mentioned, false = not mentioned
- yesPool: uint256          // total staked on YES
- noPool: uint256           // total staked on NO
- positions: mapping(address => Position)

Position struct:
- yesAmount: uint256
- noAmount: uint256
- claimed: bool
```

**Functions:**

```solidity
// Market creation (allowlist only)
createMarket(sourceHandle, targetTerm, endTime) → marketId

// Trading
buyYes(marketId) payable
buyNo(marketId) payable

// Settlement (called by CRE workflow)
resolveMarket(marketId, outcome) onlyAuthorizedReporter

// Claiming
claimWinnings(marketId)

// Views
getMarket(marketId) → Market
getPosition(marketId, user) → Position
getOdds(marketId) → (yesOdds, noOdds)
```

### 2. CRE Workflow: `mention-market/index.ts`

**Trigger:** On-chain event when market end time is reached (or cron polling)

**Logic:**
```
1. Read market details from contract (sourceHandle, targetTerm, endTime)
2. Query X API: "from:{sourceHandle} {targetTerm}" with time window
3. Determine outcome: result_count > 0 → true, else false
4. Call contract.resolveMarket(marketId, outcome)
```

**Config:**
```json
{
  "schedule": "0 */5 * * * *",
  "market": {
    "contractAddress": "0x...",
    "chainSelectorName": "ethereum-testnet-sepolia"
  },
  "twitter": {
    "apiEndpoint": "https://api.twitter.com/2/tweets/search/recent",
    "apiType": "twitter"
  }
}
```

### 3. Query Construction

X API v2 search query for "Did @elonmusk mention $DOGE?":

```
from:elonmusk $DOGE -is:retweet
```

With time bounds:
```
start_time: market creation timestamp
end_time: market end timestamp
```

---

## User Flow

```
1. Creator creates market:
   createMarket("elonmusk", "$DOGE", 1738281600)  // Jan 31 2026

2. Users trade:
   buyYes(marketId) { value: 0.1 ETH }
   buyNo(marketId) { value: 0.05 ETH }

3. Time passes, market end time reached

4. CRE workflow runs:
   - Queries X API for matches
   - Calls resolveMarket(marketId, true/false)

5. Winners claim:
   claimWinnings(marketId)
```

---

## Files to Create

```
decentralized-twitter-oracle/
├── workflow/                    # existing mention counter
└── mention-market/              # NEW
    ├── index.ts                 # market settlement workflow
    ├── config.json
    ├── secrets.example.json
    ├── workflow.yaml
    └── MentionMarket.sol        # prediction market contract
```

---

## Implementation Steps

1. **Contract:** Write `MentionMarket.sol` with market creation, trading, and settlement logic
2. **Workflow:** Adapt existing workflow to:
   - Read pending markets from contract
   - Query X API with correct from:{handle} query
   - Return boolean outcome
   - Call resolveMarket on-chain
3. **Config:** Set up config for market contract address and chain
4. **Test:** Simulate with mock API, then test with real X API

---

## Open Questions (TBD)

- **Fee structure?** Take a cut of winnings for protocol/key providers? → TBD
- **Query matching rules?** Strict vs loose matching, case sensitivity → TBD
- **Min/max stakes?** Prevent dust attacks or whale manipulation?
- **Multiple outcomes?** Support markets with >2 outcomes later?
- **Dispute mechanism?** What if X API returns wrong data?

---

## Verification

1. Deploy contract to Sepolia
2. Create test market via allowlisted address
3. Place test bets on both sides
4. Run CRE workflow simulation
5. Verify resolution and payout calculation
