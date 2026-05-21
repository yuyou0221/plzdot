export function requiredText(value: unknown) {
  const text = optionalText(value);
  return text && text.length > 0 ? text : null;
}

export function optionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
}

export function normalizeStatus(value: unknown) {
  return optionalText(value) === "停用" ? "停用" : "启用";
}

export function normalizeUserType(value: unknown) {
  return optionalText(value) === "外包" ? "外包" : "内部";
}

export function normalizeBoolean(value: unknown) {
  return value === true || value === "true" || value === "是" || value === "稳定";
}

export function optionalNonNegativeInt(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return Math.trunc(numberValue);
}

export function stringList(value: unknown) {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n，、;；]/)
      : [];

  return Array.from(
    new Set(
      rawItems
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}
