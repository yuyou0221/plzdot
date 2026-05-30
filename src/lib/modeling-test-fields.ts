const modelingTestFieldPrefixes = ["FIX-", "LOCAL-", "RESUBMIT-", "MT-TEST-", "fixture-", "local-", "resubmit-"];

export function isModelingTestFieldValue(value?: string | null) {
  const normalized = value?.trim();

  if (!normalized) {
    return false;
  }

  return modelingTestFieldPrefixes.some((prefix) => normalized.toLowerCase().startsWith(prefix.toLowerCase()));
}

export function canDisplayModelingFieldValue(value: string | null | undefined, canViewTestFields: boolean) {
  return Boolean(value?.trim()) && (canViewTestFields || !isModelingTestFieldValue(value));
}
