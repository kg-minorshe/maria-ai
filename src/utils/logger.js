const formatMeta = (meta = {}) => {
  if (!meta || typeof meta !== "object" || Object.keys(meta).length === 0) {
    return "";
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch (err) {
    return "";
  }
};

const logStep = (stage, meta) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}][STEP] ${stage}${formatMeta(meta)}`);
};

const logDebug = (scope, message, meta) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}][${scope}] ${message}${formatMeta(meta)}`);
};

const logError = (scope, message, error) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}][${scope}] ${message}`, error);
};

module.exports = { logStep, logDebug, logError };
