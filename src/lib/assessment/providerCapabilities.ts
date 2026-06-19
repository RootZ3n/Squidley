import { getProviderById, type ProviderId, type ProviderRegistryEntry, type ProviderType } from "@/lib/providers/registry";

export function resolveAssessmentProvider(args: {
  providerId: ProviderId;
}): { providerId: ProviderId; providerType: ProviderType; provider?: ProviderRegistryEntry } {
  const provider = getProviderById(args.providerId);
  return {
    providerId: args.providerId,
    providerType: provider?.type ?? "cloud",
    ...(provider ? { provider } : {}),
  };
}

export function providerIsActiveLocal(providerId: ProviderId): boolean {
  const provider = getProviderById(providerId);
  return Boolean(provider && provider.id === "ollama" && provider.type === "local" && provider.status === "active");
}
