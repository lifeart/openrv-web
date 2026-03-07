/**
 * Rate limiting and cost estimation for Claude API calls.
 *
 * Token estimation: ~4 characters per token.
 * Pricing (per million tokens):
 *   Sonnet: $3 input / $15 output
 *   Opus:   $15 input / $75 output
 * Rate limit: 5 requests per minute.
 */

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
}

export interface CumulativeCost {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  callCount: number;
}

const CHARS_PER_TOKEN = 4;

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
};

function getPricing(model: string): { input: number; output: number } {
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (model.includes(key) || key.includes(model)) {
      return pricing;
    }
  }
  // Default to Sonnet pricing
  if (model.includes('sonnet')) return PRICING['claude-sonnet-4-20250514'];
  if (model.includes('opus')) return PRICING['claude-opus-4-20250514'];
  return PRICING['claude-sonnet-4-20250514'];
}

/** Estimate token count from a string. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Estimate cost for a single API call. */
export function estimateCost(
  inputText: string,
  estimatedOutputTokens: number,
  model: string
): CostEstimate {
  const inputTokens = estimateTokens(inputText);
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (estimatedOutputTokens / 1_000_000) * pricing.output;

  return {
    inputTokens,
    outputTokens: estimatedOutputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    model,
  };
}

/** Cumulative cost tracker across multiple API calls. */
export class CostTracker {
  private cumulative: CumulativeCost = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    callCount: 0,
  };

  record(estimate: CostEstimate): void {
    this.cumulative.totalInputTokens += estimate.inputTokens;
    this.cumulative.totalOutputTokens += estimate.outputTokens;
    this.cumulative.totalCost += estimate.totalCost;
    this.cumulative.callCount++;
  }

  getCumulative(): CumulativeCost {
    return { ...this.cumulative };
  }

  logSummary(): void {
    const c = this.cumulative;
    console.log('\n--- Cost Summary ---');
    console.log(`  Calls:         ${c.callCount}`);
    console.log(`  Input tokens:  ${c.totalInputTokens.toLocaleString()}`);
    console.log(`  Output tokens: ${c.totalOutputTokens.toLocaleString()}`);
    console.log(`  Total cost:    $${c.totalCost.toFixed(4)}`);
    console.log('--------------------\n');
  }
}

/**
 * Simple rate limiter: max N requests per minute.
 * Sleeps if necessary before allowing a request.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private maxPerMinute: number;

  constructor(maxPerMinute = 5) {
    this.maxPerMinute = maxPerMinute;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    // Remove timestamps older than 1 minute
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);

    if (this.timestamps.length >= this.maxPerMinute) {
      const oldestInWindow = this.timestamps[0];
      const waitMs = 60_000 - (now - oldestInWindow) + 100; // 100ms buffer
      if (waitMs > 0) {
        console.log(`  Rate limit: waiting ${(waitMs / 1000).toFixed(1)}s...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    this.timestamps.push(Date.now());
  }
}
