// The link page's technical detail under an error: the step that failed and what the wallet or
// the API answered. A phone wallet's browser has no console to look into, so a failure there
// has to explain itself on the page. Nothing of it leaves the page.

const MAX_LENGTH = 160;

const cut = (text) =>
  text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;

const describe = (failure) => {
  const answer = failure && failure.response;
  if (answer && typeof answer.status === "number") {
    const error = answer.data && answer.data.error;
    return typeof error === "string"
      ? `${answer.status} ${error}`
      : String(answer.status);
  }
  // CIP-30: APIError, DataSignError and the like are { code, info }
  if (
    failure !== null &&
    typeof failure === "object" &&
    failure.code !== undefined &&
    failure.info !== undefined
  ) {
    return `code ${failure.code}: ${failure.info}`;
  }
  if (failure instanceof Error) {
    const code = typeof failure.code === "string" ? ` (${failure.code})` : "";
    return `${failure.name}: ${failure.message}${code}`;
  }
  return String(failure);
};

/** The detail for `failure` after `step` (the last call traced() noted), at most 160 characters. */
export const detailOf = (failure, step) =>
  cut(step ? `${step} · ${describe(failure)}` : describe(failure));

/**
 * The methods `names` of `target` (a CIP-30 api, the page's API calls), each noting its name with
 * `onStep` before the call and "<name> ok" once it resolved. A plain object, not a Proxy: a
 * wallet's api may be frozen.
 */
export const traced = (target, names, onStep) =>
  Object.fromEntries(
    names.map((name) => [
      name,
      async (...args) => {
        onStep(name);
        const result = await target[name](...args);
        onStep(`${name} ok`);
        return result;
      },
    ])
  );
