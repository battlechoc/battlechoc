// The game's HTTP client: fetch with the few things its callers took from axios (which was
// 38 kB of the first script for three files).
// - `createClient({ baseURL, timeout })` gives `get(url, config)`, `post(url, data, config)` and
//   `delete(url, config)`; config: `headers`, `signal` (an AbortSignal), `data` (delete's body).
// - A response resolves to `{ data, status, headers }`: `data` is the parsed JSON, or the text
//   when the body is no JSON ("" without a body).
// - Any status outside 200..299 rejects with an HttpError whose `response` is that object, so
//   callers read `error.response.status` and `error.response.data`.
// - Without an answer `error.response` is undefined: `code` says why ("ERR_NETWORK", the
//   timeout's "ECONNABORTED", or "ERR_CANCELED" when the caller's signal ended the request:
//   `isCancel(error)`).

class HttpError extends Error {
  constructor(message, { code, response, cause } = {}) {
    super(message, typeof cause === "undefined" ? undefined : { cause });
    this.name = code === "ERR_CANCELED" ? "CanceledError" : "HttpError";
    this.code = code;
    this.response = response;
  }
}

/** Whether the request ended because the caller aborted it (config.signal). */
const isCancel = (error) => Boolean(error && error.code === "ERR_CANCELED");

// "https://api.example" + "/user" (an absolute url stands for itself)
const join = (baseURL, url) =>
  !baseURL || /^[a-z][a-z\d+\-.]*:\/\//i.test(url)
    ? url
    : baseURL.replace(/\/+$/, "") + "/" + url.replace(/^\/+/, "");

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const createClient = ({
  baseURL = "",
  timeout = 0,
  // looked up per request, so tests and late polyfills can replace it
  fetch = (...args) => globalThis.fetch(...args),
} = {}) => {
  const request = async (method, url, { headers, signal, data } = {}) => {
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        throw new HttpError("canceled", { code: "ERR_CANCELED" });
      }
      signal.addEventListener("abort", cancel);
    }
    const timer =
      timeout > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeout)
        : undefined;
    const hasBody = typeof data !== "undefined";
    try {
      const response = await fetch(join(baseURL, url), {
        method,
        // a header without a value is not sent (fetch would send the text "undefined")
        headers: Object.fromEntries(
          Object.entries({
            Accept: "application/json, text/plain, */*",
            ...(hasBody ? { "Content-Type": "application/json" } : {}),
            ...headers,
          }).filter(([, value]) => value != null && value !== false)
        ),
        body: hasBody ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });
      const result = {
        data: parse(await response.text()),
        status: response.status,
        headers: response.headers,
      };
      if (response.status < 200 || response.status >= 300) {
        throw new HttpError(
          `Request failed with status code ${response.status}`,
          {
            code: response.status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST",
            response: result,
          }
        );
      }
      return result;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (timedOut) {
        throw new HttpError(`timeout of ${timeout}ms exceeded`, {
          code: "ECONNABORTED",
          cause: error,
        });
      }
      if (signal && signal.aborted) {
        throw new HttpError("canceled", { code: "ERR_CANCELED", cause: error });
      }
      throw new HttpError("Network Error", { code: "ERR_NETWORK", cause: error });
    } finally {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener("abort", cancel);
      }
    }
  };

  return {
    get: (url, config) => request("GET", url, config),
    post: (url, data, config) => request("POST", url, { ...config, data }),
    delete: (url, config) => request("DELETE", url, config),
  };
};

export { createClient, isCancel, HttpError };
