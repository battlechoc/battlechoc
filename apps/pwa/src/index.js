import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import rootReducer from './RootReducer';
import { gameplayLogger } from './gameplay/GamePlayLogger';
import { configureStore, getDefaultMiddleware } from 'redux-starter-kit'

const middleware = [...getDefaultMiddleware(), gameplayLogger]

const store = configureStore({ 
    reducer: rootReducer,
    middleware: middleware
});

ReactDOM.render(
    <Provider store={store}>
        <App />
    </Provider>,
    document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.register();
