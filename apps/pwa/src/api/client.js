import { createClient } from "../helper/http.js";
import { NoHealthyInternetConnectionError } from "@battlechoc/battlechoc-shared-functions";
import { account, apiUrl } from "./account.js";
import { version, builtAt } from "../build.js";

const instance = createClient({ baseURL: apiUrl });

/**
 * Calls the battlechoc API as the device account and resolves with the response ({ data,
 * status }). For "get" the third argument is an AbortSignal, for "post" and "delete" the
 * request body. Without an account (no connection) it rejects with
 * NoHealthyInternetConnectionError; an answer other than 2xx rejects with the error of
 * helper/http.js (error.response.status).
 */
const request = async (method, url, body, headers = {}) => {
  let token;
  try {
    token = await account.token();
  } catch {
    throw new NoHealthyInternetConnectionError();
  }
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
      "battlechoc-pwa-version": version,
      "battlechoc-pwa-date": builtAt,
      ...headers,
    },
  };

  if (method === "post") {
    return instance.post(url, body, config);
  } else if (method === "delete") {
    config.data = body;
    return instance.delete(url, config);
  } else {
    if (typeof body !== "undefined") {
      config.signal = body;
    }
    return instance.get(url, config);
  }
};

/** The answer's body of a GET. */
const get = async (url, signal) => (await request("get", url, signal)).data;

/** The answer's body of a POST (`headers`: extra request headers). */
const post = async (url, body, headers) =>
  (await request("post", url, body, headers)).data;

export { request, get, post };
