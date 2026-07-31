const numberingPrefixPattern =
  /^\s*(?:(?:M|EN)\s*\.?\s*\d+|\d+)(?:\s*[.．:：)\]-]\s*|[\t \u3000]+)(?=\S)/iu;

export function stripSetlistNumbering(rawLine: string) {
  return rawLine.replace(numberingPrefixPattern, "").trim();
}
