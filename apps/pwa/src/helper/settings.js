import axios from 'axios';
import firebase from '@firebase/app';
import * as http from 'http';
import * as https from 'https';
import { NoHealthyInternetConnectionError } from 'battlechoc-shared-functions';

const baseUrl = 'https://europe-west2-battlechoc.cloudfunctions.net/api';

const instance = axios.create({
    baseURL: baseUrl,
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true })
});

const ServerRequest = async (method, url, body) => {
    if (firebase.auth().currentUser) {
        const token = await firebase.auth().currentUser.getIdToken(true);
        let date = 'LOCAL_DATETIME';
        let version = 'LOCAL_VERSION';

        if (date.startsWith('LOCAL')) {
            date = new Date().getTime();
        } else {
            date = new Date(date).getTime();
        }

        if (version.startsWith('LOCAL')) {
            version = 'latest-dev'
        }

        if (typeof window.Android !== 'undefined' && typeof window.Android.getAndroidVersionCode === 'function') {
            const androidAppVersion = window.Android.getAndroidVersionCode();
            if (androidAppVersion > 10) {
                window.Android.setFirebaseUserToken(token);
                window.Android.setPwaVersion(version);
            }
        }

        let config = { headers: { 'Authorization': `Bearer ${token}`, 'battlechoc-pwa-version': version, 'battlechoc-pwa-date': date } };

        if (method === 'post') {
            return instance.post(url, body, config);
        } else if (method === 'delete') {
            config.data = body;
            return instance.delete(url, config);
        } else {
            if (typeof body !== 'undefined') {
                config.cancelToken = body;
            }
            return instance.get(url, config);
        }
    } else {
        throw new NoHealthyInternetConnectionError();
    }
}

export { ServerRequest };