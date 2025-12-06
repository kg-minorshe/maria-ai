function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { normalizeText };
