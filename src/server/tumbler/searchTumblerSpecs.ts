import {
  TumblerImageAnalysisResult,
  TumblerSpecCandidate,
} from "@/types/tumblerAutoSize";
import { lookupMockTumblerSpecs } from "./mockCatalog";

interface TumblerSpecLookupProvider {
  lookup(args: {
    searchQuery: string;
    analysis: TumblerImageAnalysisResult;
  }): Promise<TumblerSpecCandidate[]>;
}

class MockTumblerSpecLookupProvider implements TumblerSpecLookupProvider {
  async lookup(args: {
    searchQuery: string;
    analysis: TumblerImageAnalysisResult;
  }): Promise<TumblerSpecCandidate[]> {
    return lookupMockTumblerSpecs(args.searchQuery);
  }
}

class RemoteTumblerSpecLookupProvider implements TumblerSpecLookupProvider {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string | null
  ) {}

  async lookup(args: {
    searchQuery: string;
    analysis: TumblerImageAnalysisResult;
  }): Promise<TumblerSpecCandidate[]> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Remote lookup failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      candidates?: TumblerSpecCandidate[];
    };
    return Array.isArray(payload.candidates) ? payload.candidates : [];
  }
}

let hasLoggedFallback = false;

function resolveProvider(): TumblerSpecLookupProvider {
  const provider = process.env.TUMBLER_SPEC_PROVIDER ?? "mock";
  if (provider === "remote") {
    const endpoint = process.env.TUMBLER_SPEC_SEARCH_ENDPOINT;
    const apiKey = process.env.TUMBLER_SPEC_SEARCH_API_KEY ?? null;
    if (endpoint) {
      return new RemoteTumblerSpecLookupProvider(endpoint, apiKey);
    }
    if (!hasLoggedFallback) {
      hasLoggedFallback = true;
      console.info(
        "[tumbler-auto-size] remote provider requested but endpoint missing, using mock fallback"
      );
    }
  }
  return new MockTumblerSpecLookupProvider();
}

export async function searchTumblerSpecs(args: {
  searchQuery: string;
  analysis: TumblerImageAnalysisResult;
}): Promise<TumblerSpecCandidate[]> {
  const provider = resolveProvider();
  try {
    const candidates = await provider.lookup(args);
    if (candidates.length > 0) return candidates;
  } catch (error) {
    console.info(
      "[tumbler-auto-size] spec lookup failed, using mock fallback",
      error instanceof Error ? error.message : "unknown error"
    );
  }

  // Always keep dev/local usable.
  return new MockTumblerSpecLookupProvider().lookup({
    searchQuery: args.searchQuery,
    analysis: args.analysis,
  });
}
