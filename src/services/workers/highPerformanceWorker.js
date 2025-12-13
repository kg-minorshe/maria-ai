const { normalizeText } = require("../../utils/text");

module.exports = async function normalizeBatch({ batch }) {
  return batch.map((item, index) => {
    const normalizedText = normalizeText(item?.text || "");
    const normalized = {
      ...item,
      id: item?.id ?? index,
      text: normalizedText,
    };

    const serialized = JSON.stringify(normalized);

    return {
      record: normalized,
      serializedLength: Buffer.byteLength(serialized),
    };
  });
};
