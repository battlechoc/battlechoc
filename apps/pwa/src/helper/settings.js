import axios from 'axios';
import firebase from '@firebase/app';
import { NoHealthyInternetConnectionError } from '../gameplay/Errors';

const baseUrl = 'http://localhost:5000/battlechoc/europe-west1/api';

const instance = axios.create({ baseURL: baseUrl });

const ServerRequest = async (method, url, body) => {
    if (firebase.auth().currentUser) {
        let token = await firebase.auth().currentUser.getIdToken(true);

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