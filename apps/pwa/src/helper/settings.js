const ServerConfig = {
    auth: btoa('battlechoc-pwa:***REMOVED***'),
    baseUrl: 'https://us-central1-battlechoc.cloudfunctions.net/api'
};

const handleFetchError = response => {
    if (!response.ok) {
        throw Error(response.statusText);
    }
    return response.json();
}

export { ServerConfig, handleFetchError };