import {
  cre,
  consensusMedianAggregation,
  type HTTPSendRequester,
  type Runtime,
  type Workflow,
  ok,
  json,
  Runner,
  getNetwork,
} from "@chainlink/cre-sdk";
import { z } from "zod";
import {
  encodeFunctionData,
  parseAbi,
  type Address,
  keccak256,
  toBytes,
} from "viem";

// ============================================================
// CONFIG SCHEMA
// ============================================================
const configSchema = z.object({
  // Cron schedule for checking mentions
  schedule: z.string(),

  // Search configuration
  search: z.object({
    // Terms to search for (e.g., ["chainlink", "LINK", "$LINK"])
    terms: z.array(z.string()),
    // Time window in minutes to look back
    windowMinutes: z.number(),
    // API endpoint (mock for testing, Twitter API for production)
    apiEndpoint: z.string(),
    // API type: "mock" | "twitter"
    apiType: z.string(),
    // Bearer token for X API (for local testing - use secrets in production)
    bearerToken: z.string().optional(),
  }),

  // Optional: On-chain reporting
  evm: z.object({
    enabled: z.boolean(),
    chainSelectorName: z.string(),
    contractAddress: z.string(),
    gasLimit: z.number(),
  }).optional(),
});

type Config = z.infer<typeof configSchema>;

// Secrets schema for sensitive data
const secretsSchema = z.object({
  TWITTER_BEARER_TOKEN: z.string(),
});

type Secrets = z.infer<typeof secretsSchema>;

// Extended config passed to HTTP callback (includes bearer token)
interface FetchConfig extends Config {
  bearerToken?: string;
}

// ============================================================
// MENTION REGISTRY CONTRACT ABI
// ============================================================
// Simple contract to store mention counts
const MENTION_REGISTRY_ABI = parseAbi([
  "function reportMentions(bytes32 termHash, uint256 count, uint256 timestamp) external",
  "function getMentionCount(bytes32 termHash) external view returns (uint256)",
  "function getLastUpdate(bytes32 termHash) external view returns (uint256)",
]);

// ============================================================
// TYPES
// ============================================================
interface MentionResult {
  term: string;
  count: number;
  timestamp: number;
}

interface SearchResults {
  totalMentions: number;
  results: MentionResult[];
  searchedAt: number;
}

// Mock API response structure
interface MockApiResponse {
  query: string;
  count: number;
  recent_tweets: Array<{
    id: string;
    text: string;
    created_at: string;
    author: string;
  }>;
}

// Twitter API response structure (simplified)
interface TwitterApiResponse {
  data: Array<{
    id: string;
    text: string;
    created_at: string;
    author_id: string;
  }>;
  meta: {
    result_count: number;
    newest_id: string;
    oldest_id: string;
  };
}

// ============================================================
// STEP 1: FETCH ALL MENTIONS FROM X API
// ============================================================
// IMPORTANT: CRE has a limit of 5 HTTP calls per workflow.
// X API requires one call per search term, so we limit to max 5 terms.
// For more terms, consider batching or using a proxy API.
const fetchAllMentions = (
  sendRequester: HTTPSendRequester,
  config: FetchConfig
): SearchResults => {
  const { apiEndpoint, apiType, windowMinutes, terms } = config.search;
  const bearerToken = config.bearerToken;

  const timestamp = Date.now();
  const results: MentionResult[] = [];
  let totalMentions = 0;

  // For mock API, use simulated data
  if (apiType === "mock" || !bearerToken) {
    const url = `${apiEndpoint}?terms=${encodeURIComponent(terms.join(","))}&minutes=${windowMinutes}`;

    sendRequester.sendRequest({ url, method: "GET" }).result();

    for (const term of terms) {
      const baseCount = term.toLowerCase().includes("chainlink") ? 150 :
                       term.includes("$") ? 75 : 50;
      const variance = (term.length * 7) % 20;
      const count = baseCount + variance;
      results.push({ term, count, timestamp });
      totalMentions += count;
    }

    return { totalMentions, results, searchedAt: timestamp };
  }

  // For X API, fetch each term (limited by CRE's 5-call limit)
  const termsToFetch = terms.slice(0, 5);
  const startTime = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  for (const term of termsToFetch) {
    // Build X API v2 search URL
    // Using -is:retweet to avoid counting retweets
    const query = encodeURIComponent(`${term} -is:retweet`);
    const url = `${apiEndpoint}?query=${query}&start_time=${startTime}&max_results=100`;

    const response = sendRequester
      .sendRequest({
        url,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
      })
      .result();

    let count = 0;

    if (ok(response)) {
      try {
        const data = json(response) as TwitterApiResponse;
        count = data.meta?.result_count ?? 0;
      } catch {
        count = 0;
      }
    }

    results.push({ term, count, timestamp });
    totalMentions += count;
  }

  return {
    totalMentions,
    results,
    searchedAt: timestamp,
  };
};

// ============================================================
// STEP 3: WRITE MENTIONS TO BLOCKCHAIN (optional)
// ============================================================
const reportMentionsOnChain = (
  runtime: Runtime<Config, Secrets>,
  results: SearchResults
): string => {
  const evmConfig = runtime.config.evm;

  if (!evmConfig?.enabled) {
    runtime.log("[CHAIN] On-chain reporting disabled");
    return "disabled";
  }

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evmConfig.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    runtime.log(`[CHAIN] Network not found: ${evmConfig.chainSelectorName}`);
    return "network-not-found";
  }

  const evmClient = new cre.capabilities.EVMClient(
    network.chainSelector.selector
  );

  // Report each term's mentions on-chain
  const txHashes: string[] = [];

  for (const result of results.results) {
    // Create a hash of the search term for on-chain storage
    const termHash = keccak256(toBytes(result.term));

    runtime.log(`[CHAIN] Reporting ${result.count} mentions for "${result.term}"`);
    runtime.log(`[CHAIN] Term hash: ${termHash}`);

    // Encode the function call
    const writeData = encodeFunctionData({
      abi: MENTION_REGISTRY_ABI,
      functionName: "reportMentions",
      args: [
        termHash as `0x${string}`,
        BigInt(result.count),
        BigInt(Math.floor(result.timestamp / 1000)), // Unix timestamp
      ],
    });

    runtime.log(`[CHAIN] Encoded payload: ${writeData.slice(0, 50)}...`);

    // In simulation mode, just log what would happen
    // In production with --broadcast, this would execute:
    //   const report = runtime.report(prepareReportRequest(writeData)).result();
    //   const txResult = evmClient.writeReport(runtime, { ... }).result();

    txHashes.push(`simulated-tx-${result.term}`);
  }

  return txHashes.join(",");
};

// ============================================================
// MAIN HANDLER
// ============================================================
const onCronTrigger = (runtime: Runtime<Config, Secrets>): string => {
  runtime.log("╔════════════════════════════════════════════════════════════╗");
  runtime.log("║           MENTION MARKET - Checking Mentions               ║");
  runtime.log("╚════════════════════════════════════════════════════════════╝");

  const { terms, windowMinutes, apiType } = runtime.config.search;

  runtime.log(`[CONFIG] Searching for: ${terms.join(", ")}`);
  runtime.log(`[CONFIG] Time window: ${windowMinutes} minutes`);
  runtime.log(`[CONFIG] API type: ${apiType}`);

  // Get bearer token from config (for local testing) or secrets (for production)
  const bearerToken = runtime.config.search.bearerToken || runtime.secrets?.TWITTER_BEARER_TOKEN;
  if (apiType === "twitter" && bearerToken) {
    runtime.log("[AUTH] X API Bearer token loaded");
    runtime.log(`[AUTH] Token prefix: ${bearerToken.substring(0, 20)}...`);
  } else if (apiType === "twitter") {
    runtime.log("[AUTH] WARNING: No bearer token found, using mock data");
  }

  // Build config with bearer token for HTTP callback
  const fetchConfig: FetchConfig = {
    ...runtime.config,
    bearerToken,
  };

  // Create HTTP client
  const httpClient = new cre.capabilities.HTTPClient();

  // Fetch mentions with consensus aggregation
  // Each node will independently fetch and the results are aggregated
  runtime.log("[FETCH] Fetching mentions from X API...");

  const searchResults = httpClient
    .sendRequest(runtime, fetchAllMentions, consensusMedianAggregation())(
      fetchConfig
    )
    .result();

  // Log results
  runtime.log("────────────────────────────────────────────────────────────");
  runtime.log("[RESULTS] Mention counts:");

  for (const result of searchResults.results) {
    runtime.log(`  • "${result.term}": ${result.count} mentions`);
  }

  runtime.log(`  ─────────────────────────`);
  runtime.log(`  TOTAL: ${searchResults.totalMentions} mentions`);
  runtime.log("────────────────────────────────────────────────────────────");

  // Report on-chain if enabled
  const txResult = reportMentionsOnChain(runtime, searchResults);
  runtime.log(`[CHAIN] Transaction result: ${txResult}`);

  // Build summary
  const summary = {
    totalMentions: searchResults.totalMentions,
    terms: searchResults.results.map(r => ({ term: r.term, count: r.count })),
    timestamp: new Date(searchResults.searchedAt).toISOString(),
    onChainTx: txResult,
  };

  runtime.log("╔════════════════════════════════════════════════════════════╗");
  runtime.log("║                    Workflow Complete                       ║");
  runtime.log("╚════════════════════════════════════════════════════════════╝");

  return JSON.stringify(summary);
};

// ============================================================
// WORKFLOW INITIALIZATION
// ============================================================
const initWorkflow = (runtime: Runtime<Config, Secrets>): Workflow<Config, Secrets> => {
  const cronCapability = new cre.capabilities.CronCapability();
  // Run every 5 minutes by default (configurable in config.json)
  const trigger = cronCapability.trigger({ schedule: "0 */5 * * * *" });

  return [cre.handler(trigger, onCronTrigger)];
};

// ============================================================
// ENTRY POINT
// ============================================================
export async function main() {
  const runner = await Runner.newRunner<Config, Secrets>({ configSchema, secretsSchema });
  await runner.run(initWorkflow);
}

main();
