# Mention Market - Architecture Map

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OFF-CHAIN                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │   X (Twitter) │     │              CHAINLINK DON                      │   │
│  │      API      │     │  ┌─────────┐ ┌─────────┐ ┌─────────┐           │   │
│  │               │◄────┼──│ Node 1  │ │ Node 2  │ │ Node N  │  (21+)    │   │
│  │  /2/tweets/   │     │  │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │           │   │
│  │  search/recent│     │  │ │Key A│ │ │ │Key B│ │ │ │Key N│ │           │   │
│  └──────────────┘     │  │ └─────┘ │ │ └─────┘ │ │ └─────┘ │           │   │
│                        │  └────┬────┘ └────┬────┘ └────┬────┘           │   │
│                        │       │           │           │                 │   │
│                        │       └───────────┼───────────┘                 │   │
│                        │                   ▼                             │   │
│                        │           ┌──────────────┐                      │   │
│                        │           │  CONSENSUS   │                      │   │
│                        │           │  (BFT 2/3)   │                      │   │
│                        │           └──────┬───────┘                      │   │
│                        │                  │                              │   │
│                        │                  ▼                              │   │
│                        │           ┌──────────────┐                      │   │
│                        │           │    REPORT    │                      │   │
│                        │           │  (signed by  │                      │   │
│                        │           │   N nodes)   │                      │   │
│                        │           └──────┬───────┘                      │   │
│                        └─────────────────┼──────────────────────────────┘   │
│                                          │                                   │
└──────────────────────────────────────────┼───────────────────────────────────┘
                                           │
═══════════════════════════════════════════╪═══════════════════════════════════
                                           │
┌──────────────────────────────────────────┼───────────────────────────────────┐
│                              ON-CHAIN    │    (Ethereum / Base / etc)        │
├──────────────────────────────────────────┼───────────────────────────────────┤
│                                          ▼                                   │
│                        ┌─────────────────────────────────┐                   │
│                        │      KEYSTONE FORWARDER         │                   │
│                        │  ┌───────────────────────────┐  │                   │
│                        │  │ verifySignatures(report)  │  │                   │
│                        │  │ forwardToReceiver(data)   │  │                   │
│                        │  └───────────────────────────┘  │                   │
│                        └────────────────┬────────────────┘                   │
│                                         │                                    │
│                                         ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                       MENTION MARKET CONTRACT                         │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                          STATE                                   │ │   │
│  │  │  markets: mapping(uint256 => Market)                            │ │   │
│  │  │  positions: mapping(uint256 => mapping(address => Position))    │ │   │
│  │  │  allowedCreators: mapping(address => bool)                      │ │   │
│  │  │  authorizedReporter: address  (Keystone Forwarder)              │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                     MARKET CREATION                              │ │   │
│  │  │  createMarket(sourceHandle, targetTerm, endTime) → marketId     │ │   │
│  │  │    • onlyAllowedCreators                                        │ │   │
│  │  │    • emits MarketCreated(marketId, sourceHandle, targetTerm)    │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                        TRADING                                   │ │   │
│  │  │  buyYes(marketId) payable                                       │ │   │
│  │  │    • requires market not resolved                               │ │   │
│  │  │    • requires block.timestamp < endTime                         │ │   │
│  │  │    • updates yesPool, positions[marketId][msg.sender]           │ │   │
│  │  │    • emits PositionTaken(marketId, user, YES, amount)           │ │   │
│  │  │                                                                  │ │   │
│  │  │  buyNo(marketId) payable                                        │ │   │
│  │  │    • same as buyYes but for NO side                             │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                      RESOLUTION                                  │ │   │
│  │  │  resolveMarket(marketId, didMention) external                   │ │   │
│  │  │    • onlyAuthorizedReporter (Keystone Forwarder)                │ │   │
│  │  │    • requires block.timestamp >= endTime                        │ │   │
│  │  │    • requires !markets[marketId].resolved                       │ │   │
│  │  │    • sets outcome = didMention                                  │ │   │
│  │  │    • sets resolved = true                                       │ │   │
│  │  │    • emits MarketResolved(marketId, didMention)                 │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                       SETTLEMENT                                 │ │   │
│  │  │  claimWinnings(marketId) external                               │ │   │
│  │  │    • requires markets[marketId].resolved                        │ │   │
│  │  │    • requires !positions[marketId][msg.sender].claimed          │ │   │
│  │  │    • calculates payout based on outcome and pool ratios         │ │   │
│  │  │    • transfers ETH to winner                                    │ │   │
│  │  │    • emits WinningsClaimed(marketId, user, amount)              │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                         VIEWS                                    │ │   │
│  │  │  getMarket(marketId) → Market                                   │ │   │
│  │  │  getPosition(marketId, user) → Position                         │ │   │
│  │  │  getOdds(marketId) → (yesOdds, noOdds)                         │ │   │
│  │  │  getPendingMarkets() → uint256[]  (for CRE to query)           │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Market Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: MARKET CREATION                                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐                              ┌─────────────────────┐
  │  Market  │  createMarket(               │   MentionMarket     │
  │  Creator │  "elonmusk",                 │     Contract        │
  │          │  "$DOGE",          ────────► │                     │
  │          │  1738281600                  │  marketId = 1       │
  └──────────┘  )                           │  status = OPEN      │
                                            └─────────────────────┘
                                                      │
                                                      ▼
                                            ┌─────────────────────┐
                                            │ Event:              │
                                            │ MarketCreated(      │
                                            │   id: 1,            │
                                            │   source: elonmusk, │
                                            │   target: $DOGE,    │
                                            │   endTime: 173...   │
                                            │ )                   │
                                            └─────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: TRADING                                                            │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐                              ┌─────────────────────┐
  │  User A  │  buyYes(1)                   │   MentionMarket     │
  │          │  {value: 1 ETH}   ─────────► │                     │
  └──────────┘                              │  yesPool = 1 ETH    │
                                            │  positions[1][A] =  │
  ┌──────────┐                              │    {yes: 1, no: 0}  │
  │  User B  │  buyNo(1)                    │                     │
  │          │  {value: 0.5 ETH} ─────────► │  noPool = 0.5 ETH   │
  └──────────┘                              │  positions[1][B] =  │
                                            │    {yes: 0, no: 0.5}│
  ┌──────────┐                              │                     │
  │  User C  │  buyYes(1)                   │  yesPool = 1.2 ETH  │
  │          │  {value: 0.2 ETH} ─────────► │  positions[1][C] =  │
  └──────────┘                              │    {yes: 0.2, no: 0}│
                                            └─────────────────────┘

  Current Odds: YES 70.6% (1.2/1.7) | NO 29.4% (0.5/1.7)


┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: RESOLUTION (after endTime)                                         │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐      Query: from:elonmusk $DOGE      ┌─────────────┐
  │             │      start_time: market.createdAt    │             │
  │  Chainlink  │      end_time: market.endTime        │  X (Twitter)│
  │    DON      │ ──────────────────────────────────►  │     API     │
  │             │                                      │             │
  │  (21 nodes) │ ◄──────────────────────────────────  │             │
  │             │      Response: result_count = 3      │             │
  └──────┬──────┘                                      └─────────────┘
         │
         │  Consensus: 3 > 0 → didMention = TRUE
         │
         ▼
  ┌─────────────┐
  │   Report    │
  │  {          │
  │   marketId:1│
  │   outcome:  │
  │    true     │
  │   sigs: []  │
  │  }          │
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────┐      ┌─────────────────────────────────────┐
  │ Keystone Forwarder  │      │          MentionMarket              │
  │                     │      │                                     │
  │ verifySignatures()  │─────►│  resolveMarket(1, true)             │
  │ forward()           │      │                                     │
  └─────────────────────┘      │  markets[1].resolved = true         │
                               │  markets[1].outcome = true (YES)    │
                               └─────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: SETTLEMENT                                                         │
└─────────────────────────────────────────────────────────────────────────────┘

  Outcome: YES won
  Total Pool: 1.7 ETH (1.2 YES + 0.5 NO)
  Winners: User A (1 ETH), User C (0.2 ETH)

  ┌──────────┐                              ┌─────────────────────┐
  │  User A  │  claimWinnings(1)            │   MentionMarket     │
  │          │ ────────────────────────────►│                     │
  │          │                              │  payout = 1/1.2 *   │
  │          │ ◄────────────────────────────│    1.7 = 1.417 ETH  │
  └──────────┘      transfer 1.417 ETH      └─────────────────────┘

  ┌──────────┐                              ┌─────────────────────┐
  │  User C  │  claimWinnings(1)            │   MentionMarket     │
  │          │ ────────────────────────────►│                     │
  │          │                              │  payout = 0.2/1.2 * │
  │          │ ◄────────────────────────────│    1.7 = 0.283 ETH  │
  └──────────┘      transfer 0.283 ETH      └─────────────────────┘

  User B (NO side): Gets nothing - lost 0.5 ETH
```

---

## CRE Workflow Detail

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CRE WORKFLOW: mention-market                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│    TRIGGER      │
│                 │
│  Option A:      │
│  Cron schedule  │───► runs every 5 min, checks for markets past endTime
│  "*/5 * * * *"  │
│                 │
│  Option B:      │
│  API trigger    │───► called externally with marketId parameter
│  /resolve?id=1  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: READ MARKET DATA FROM CHAIN                                         │
│                                                                              │
│   const market = evmClient.callContract({                                   │
│     to: MARKET_CONTRACT,                                                    │
│     data: encodeFunctionData({                                              │
│       abi: MARKET_ABI,                                                      │
│       functionName: "getMarket",                                            │
│       args: [marketId]                                                      │
│     })                                                                      │
│   })                                                                        │
│                                                                              │
│   Output: { sourceHandle, targetTerm, endTime, resolved }                   │
└────────┬────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: CHECK IF READY FOR RESOLUTION                                       │
│                                                                              │
│   if (market.resolved) return "already resolved"                            │
│   if (Date.now() < market.endTime) return "not yet ended"                   │
└────────┬────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: QUERY X API (with consensus)                                        │
│                                                                              │
│   const query = `from:${market.sourceHandle} ${market.targetTerm}`          │
│                                                                              │
│   const result = httpClient.sendRequest(                                    │
│     runtime,                                                                │
│     (requester) => {                                                        │
│       const response = requester.sendRequest({                              │
│         url: `https://api.twitter.com/2/tweets/search/recent`,              │
│         params: {                                                           │
│           query: query,                                                     │
│           start_time: market.createdAt,                                     │
│           end_time: market.endTime                                          │
│         },                                                                  │
│         headers: { Authorization: `Bearer ${token}` }                       │
│       })                                                                    │
│       return response.meta.result_count                                     │
│     },                                                                      │
│     consensusMedianAggregation()                                            │
│   )                                                                         │
│                                                                              │
│   Output: resultCount (median across all nodes)                             │
└────────┬────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: DETERMINE OUTCOME                                                   │
│                                                                              │
│   const didMention = resultCount > 0                                        │
└────────┬────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: GENERATE SIGNED REPORT                                              │
│                                                                              │
│   const report = runtime.report(                                            │
│     prepareReportRequest(                                                   │
│       encodeFunctionData({                                                  │
│         abi: MARKET_ABI,                                                    │
│         functionName: "resolveMarket",                                      │
│         args: [marketId, didMention]                                        │
│       })                                                                    │
│     )                                                                       │
│   )                                                                         │
│                                                                              │
│   Output: Report signed by DON nodes                                        │
└────────┬────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: SUBMIT TO CHAIN VIA KEYSTONE FORWARDER                              │
│                                                                              │
│   evmClient.writeReport(runtime, {                                          │
│     report: report,                                                         │
│     to: KEYSTONE_FORWARDER,                                                 │
│     gasLimit: 300000                                                        │
│   })                                                                        │
│                                                                              │
│   → Forwarder verifies signatures                                           │
│   → Forwarder calls MentionMarket.resolveMarket(marketId, didMention)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Contract Structs & Events

```solidity
// ============================================================
// STRUCTS
// ============================================================

struct Market {
    uint256 id;
    string sourceHandle;      // e.g., "elonmusk"
    string targetTerm;        // e.g., "$DOGE"
    uint256 createdAt;        // block.timestamp at creation
    uint256 endTime;          // resolution timestamp
    bool resolved;
    bool outcome;             // true = mentioned
    uint256 yesPool;
    uint256 noPool;
}

struct Position {
    uint256 yesAmount;
    uint256 noAmount;
    bool claimed;
}

// ============================================================
// EVENTS
// ============================================================

event MarketCreated(
    uint256 indexed marketId,
    string sourceHandle,
    string targetTerm,
    uint256 endTime
);

event PositionTaken(
    uint256 indexed marketId,
    address indexed user,
    bool isYes,
    uint256 amount
);

event MarketResolved(
    uint256 indexed marketId,
    bool outcome
);

event WinningsClaimed(
    uint256 indexed marketId,
    address indexed user,
    uint256 amount
);
```

---

## Component Summary

| Component | Type | Description |
|-----------|------|-------------|
| X API | Off-chain | Data source for mention queries |
| Chainlink DON | Off-chain | 21+ nodes running CRE workflow |
| API Key Pool | Off-chain | Encrypted secrets managed by CRE |
| CRE Workflow | Off-chain | TypeScript code compiled to WASM |
| Keystone Forwarder | On-chain | Verifies DON signatures, forwards calls |
| MentionMarket | On-chain | Market creation, trading, settlement |

---

## Open Design Questions

- [ ] Fee structure (protocol cut from winnings?)
- [ ] Query matching rules (strict vs loose)
- [ ] Dispute mechanism (what if API returns wrong data?)
- [ ] Multi-chain deployment strategy
- [ ] Key provider incentive model (usage tracking from Chainlink call)
