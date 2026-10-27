import axios from "axios";
import { NoHealthyInternetConnectionError } from "@battlechoc/battlechoc-shared-functions";
import { account, apiUrl } from "../account";
import { version, builtAt } from "../build";

const instance = axios.create({
  baseURL: apiUrl,
});

// Calls the battlechoc API as the device account. For "get" the third argument is an
// AbortSignal, for "post" and "delete" the request body.
const ServerRequest = async (method, url, body) => {
  let token;
  try {
    token = await account.token();
  } catch (error) {
    throw new NoHealthyInternetConnectionError();
  }
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
      "battlechoc-pwa-version": version,
      "battlechoc-pwa-date": builtAt,
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

export { ServerRequest };
