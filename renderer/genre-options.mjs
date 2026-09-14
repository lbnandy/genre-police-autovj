const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function searchable(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim();
}

export function sortGenreOptions(options) {
  return [...options].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
    return collator.compare(left.label, right.label);
  });
}

export function matchesGenreQuery(label, query) {
  const needle = searchable(query);
  return !needle || searchable(label).includes(needle);
}
