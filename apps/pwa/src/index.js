import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import { translate as t, keys as tr } from './ui/misc';
import rootReducer from './RootReducer';
import { showQuickMessage } from './ui/UiActions';
import { gameplayLogger } from './gameplay/GamePlayLogger';
import actionValidator from './gameplay/ActionValidator';
import multiplayerActionRelay from './gameplay/MultiplayerActionRelay';
import { configureStore, getDefaultMiddleware } from 'redux-starter-kit';
import { ThemeProvider } from 'react-jss';

const store = configureStore({ 
    reducer: rootReducer,
    middleware: [...getDefaultMiddleware(), actionValidator, multiplayerActionRelay, gameplayLogger]
});

const theme = {
    color: {
        primary: { light: '#90D01B', dark: '#10A67B'},
        secondary: { light: '#3190C3', dark: '#1B4E69'},
        accent: { light: '#FF4E85', dark: '#772549'},
        gold: { light: '#FAD25A', dark: '#AE8D0B'},
        facebook: { light: '#6589F4', dark: '#435DAC'},
        instagram: { light: '#FE5A93', dark: '#803FBB'}
    },
    breakpoints: {
        desktop: '@media screen and (min-width: 1200px)',
        laptop: '@media screen and (min-width: 992px)',
        tablet: '@media screen and (min-width: 768px)',
        smartphone: '@media screen and (min-width: 576px)',
        landscape: {
            smartphone: '@media screen and (min-width: 576px) and (orientation: landscape)',
            tablet: '@media screen and (min-width: 768px) and (orientation: landscape)'
        },
        portrait: {
            smartphone: '@media screen and (min-width: 576px) and (orientation: portrait)',
            tablet: '@media screen and (min-width: 768px) and (orientation: portrait)'
        },      
    }
}

ReactDOM.render(
    <Provider store={store}>
        <ThemeProvider theme={theme}>
            <App />
        </ThemeProvider>
    </Provider>,
    document.getElementById('root')
);

let config = {
    onUpdate: () => {
        store.dispatch(showQuickMessage({ 
            text: t(tr.PWA_UPDATE_AVAILABLE),
            variant: 'info'
        }));
    }
}

serviceWorker.register(config);

window.addEventListener("offline", () => { 
    store.dispatch(showQuickMessage({ 
        text: t(tr.PWA_OFFLINE_MODE),
        variant: 'info',
        type: 'PWA_OFFLINE_MESSAGE'
    }));
});

window.addEventListener("online", () => { 
    store.dispatch(showQuickMessage({ 
        text: t(tr.PWA_ONLINE_MODE),
        variant: 'info',
        type: 'PWA_ONLINE_MESSAGE'
    }));
});
