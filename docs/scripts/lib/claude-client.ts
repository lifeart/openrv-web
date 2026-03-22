/**
 * Claude API wrapper for documentation generation.
 *
 * Uses @anthropic-ai/sdk with configurable model, temperature, and max tokens.
 * Requires ANTHROPIC_API_KEY environment variable for actual API calls.
 */

import Anthropic from '@anthropic-ai/sdk';
import { RateLimiter, CostTracker, estimateCost, type CostEstimate } from './rate-limiter.js';

export interface GenerateDocOptions {
  /** Model to use. Defaults to claude-sonnet-4-20250514. */
  model?: string;
  /** Max output tokens. Defaults to 4096. */
  maxTokens?: number;
  /** Temperature. Defaults to 0.0. */
  temperature?: number;
  /** System prompt for the API call. */
  systemPrompt?: string;
}

export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
export const OPUS_MODEL = 'claude-opus-4-20250514';

const rateLimiter = new RateLimiter(5);
const costTracker = new CostTracker();

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY environment variable is required. ' + 'Set it before running without --dry-run.',
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Generate documentation by calling the Claude API.
 *
 * @param userPrompt - The user message containing source code and context.
 * @param options - Model, temperature, maxTokens, systemPrompt.
 * @returns The generated markdown string.
 */
export async function generateDoc(userPrompt: string, options: GenerateDocOptions = {}): Promise<string> {
  const { model = DEFAULT_MODEL, maxTokens = 4096, temperature = 0.0, systemPrompt } = options;

  // Rate limiting
  await rateLimiter.waitForSlot();

  // Cost estimation and logging
  const fullInput = (systemPrompt || '') + userPrompt;
  const estimate = estimateCost(fullInput, maxTokens, model);
  costTracker.record(estimate);
  console.log(
    `  API call: ~${estimate.inputTokens} in, ~${estimate.outputTokens} out, ` +
      `~$${estimate.totalCost.toFixed(4)} (${model})`,
  );

  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: 'user', content: userPrompt }],
  });

  // Extract text from response
  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in API response');
  }

  return textBlock.text;
}

/**
 * Estimate the cost of an API call without making it (for --dry-run).
 */
export function dryRunEstimate(userPrompt: string, options: GenerateDocOptions = {}): CostEstimate {
  const { model = DEFAULT_MODEL, maxTokens = 4096, systemPrompt } = options;

  const fullInput = (systemPrompt || '') + userPrompt;
  return estimateCost(fullInput, maxTokens, model);
}

/** Get the cumulative cost tracker. */
export function getCostTracker(): CostTracker {
  return costTracker;
}
