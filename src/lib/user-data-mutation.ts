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

export function normalizeTeamType(value: unknown) {
  const text = optionalText(value);
  const allowed = ["产品", "制作", "设计", "打样", "运营", "商务", "供应链"];

  return text && allowed.includes(text) ? text : (text ?? "产品");
}

export function normalizeVendorType(value: unknown) {
  return optionalText(value) ?? "建模外包";
}

export function normalizeBoolean(value: unknown) {
  return value === true || value === "true" || value === "是" || value === "稳定" || value === "可排期";
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

export function optionalWorkdays(value: unknown) {
  const numberValue = optionalNonNegativeInt(value);

  if (numberValue === null) {
    return null;
  }

  return Math.min(numberValue, 7);
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

export function businessRoleList(value: unknown) {
  return stringList(value);
}

export function parseDateOnly(value: unknown) {
  const text = optionalText(value);

  if (!text) {
    return null;
  }

  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
