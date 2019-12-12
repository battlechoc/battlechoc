import axios from 'axios';
import firebase from '@firebase/app';

const baseUrl = 'https://europe-west1-battlechoc.cloudfunctions.net/api';

const instance = axios.create({ baseURL: baseUrl });

const ServerRequest = async (method, url, body) => {
    if (firebase.auth().currentUser) {
        let token = await firebase.auth().currentUser.getIdToken(true);

        let config = { headers: { 'Authorization': `Bearer ${token}` } };

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
        throw ReferenceError('The firebase user does not exist');
    }
}

export { ServerRequest };