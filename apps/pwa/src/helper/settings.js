import axios from 'axios';

const ServerConfig = {
    auth: btoa('battlechoc-pwa:***REMOVED***'),
    baseUrl: 'https://europe-west1-battlechoc.cloudfunctions.net/api'
};

const instance = axios.create({
  baseURL: ServerConfig.baseUrl,
  headers: { 'Authorization': 'Basic ' + ServerConfig.auth }
});

export { instance as axios };