import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { modelCostUsd, modelPrice, type ModelPrice } from "~/server/mastra/models";

const PRICE: ModelPrice = { inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.2, cacheWritePerMTok: 2.5 };

describe("modelCostUsd", () => {
  it("charges input and output per million tokens", () => {
    assert.equal(modelCostUsd({ inputTokens: 1_000_000, outputTokens: 100_000 }, PRICE), 3);
    assert.equal(modelCostUsd(undefined, PRICE), 0);
    assert.equal(modelCostUsd({}, PRICE), 0);
  });

  it("bills reasoning as output, without counting it twice", () => {
    // completion_tokens already includes reasoning.
    assert.equal(modelCostUsd({ inputTokens: 0, outputTokens: 1_000, reasoningTokens: 800 }, PRICE), 0.01);
    // A provider that reports reasoning separately.
    assert.equal(modelCostUsd({ inputTokens: 0, outputTokens: 200, reasoningTokens: 800 }, PRICE), 0.01);
  });

  it("reads the gateway's Anthropic-style cache tokens from the raw usage", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      raw: { raw: { prompt_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 } },
    };
    assert.equal(modelCostUsd(usage, PRICE), 2 + 0.2 + 2.5);
  });

  it("bills OpenAI-style cached input at the cache-read rate", () => {
    assert.ok(Math.abs(modelCostUsd({ inputTokens: 1_000_000, cachedInputTokens: 500_000 }, PRICE) - 1.1) < 1e-9);
  });

  it("ignores junk values", () => {
    assert.equal(modelCostUsd({ inputTokens: Number.NaN, outputTokens: -5 }, PRICE), 0);
  });
});

describe("modelPrice", () => {
  it("overrides fields from the environment and ignores bad values", () => {
    const price = modelPrice(
      { LIVEBASE_ENRICHMENT_PRICE_INPUT: "3", LIVEBASE_ENRICHMENT_PRICE_OUTPUT: "fifteen", LIVEBASE_ENRICHMENT_PRICE_CACHE_READ: "" },
      PRICE,
    );
    assert.deepEqual(price, { ...PRICE, inputPerMTok: 3 });
  });
});
