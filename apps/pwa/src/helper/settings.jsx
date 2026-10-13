import axios from "axios";
import { auth } from "../firebase";
import { NoHealthyInternetConnectionError } from "@battlechoc/battlechoc-shared-functions";

const baseUrl = "https://europe-west2-battlechoc.cloudfunctions.net/api";
let date = "LOCAL_DATETIME";
let version = import.meta.env.VITE_VERSION;

if (date.startsWith("LOCAL")) {
  date = new Date().getTime();
} else {
  date = new Date(date).getTime();
}

const setAndroidDefaults = async () => {
  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken(true);
    if (
      typeof window.Android !== "undefined" &&
      typeof window.Android.getAndroidVersionCode === "function"
    ) {
      const androidAppVersion = window.Android.getAndroidVersionCode();
      if (androidAppVersion > 10) {
        window.Android.setFirebaseUserToken(token);
        window.Android.setPwaVersion(version);
      }
    }
  }
};

const generateNewAndroidMessagingToken = async () => {
  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken(true);
    if (
      typeof window.Android !== "undefined" &&
      typeof window.Android.getAndroidVersionCode === "function"
    ) {
      const androidAppVersion = window.Android.getAndroidVersionCode();
      if (androidAppVersion > 11) {
        window.Android.setFirebaseUserToken(token, true);
      }
    }
  }
};

const instance = axios.create({
  baseURL: baseUrl
});

const ServerRequest = async (method, url, body) => {
  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken(true);
    let config = {
      headers: {
        Authorization: `Bearer ${token}`,
        "battlechoc-pwa-version": version,
        "battlechoc-pwa-date": date,
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
  } else {
    throw new NoHealthyInternetConnectionError();
  }
};

export { ServerRequest, generateNewAndroidMessagingToken, setAndroidDefaults };
