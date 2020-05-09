import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import { translate as t, keys as tr } from './ui/misc';
import rootReducer from './RootReducer';
import { multiplayer } from './Multiplayer';
import { showQuickMessage } from './ui/UiActions';
import { gameplayLogger } from './gameplay/GamePlayLogger';
import actionValidator from './gameplay/ActionValidator';
import multiplayerActionRelay from './gameplay/MultiplayerActionRelay';
import { configureStore, getDefaultMiddleware } from 'redux-starter-kit'
import { createMuiTheme, MuiThemeProvider } from '@material-ui/core/styles';
import red from '@material-ui/core/colors/red';

const defaultTheme = createMuiTheme({
    palette: {
        primary: { main: '#457B82' },
        secondary: { main: '#324D5C' },
        text: {
            primary: 'rgba(0, 0, 0, 0.87)',
            secondary: 'rgba(255, 255, 255, 0.87)',
            error: red
        }
    },
    typography: {
        useNextVariants: true,
        fontFamily: "'PT Serif', serif"
    }
});

const { breakpoints } = defaultTheme

const theme = createMuiTheme({
    ...defaultTheme,
    overrides: {
        MuiTypography: {
            h6: {
                [breakpoints.down("sm")]: {
                    fontSize: '0.8rem'
                },
                [breakpoints.up("sm")]: {
                    fontSize: '1rem'
                },
                [breakpoints.up("md")]: {
                    fontSize: '1.2rem',
                    margin: 4
                },
                [breakpoints.up("lg")]: {
                    fontSize: '1.4rem',
                    margin: 4
                }
            },
            paragraph: {
                marginBottom: 8,
                fontSize: '0.6rem',
                [breakpoints.up("sm")]: {
                    fontSize: '0.7rem'
                },
                [breakpoints.up("md")]: {
                    fontSize: '0.9rem',
                    marginBottom: 8,
                    margin: 4
                },
                [breakpoints.up("lg")]: {
                    fontSize: '1.1rem',
                    marginBottom: 16,
                    margin: 8
                }
            }
        },
        MuiTableCell: {
            head: {
                color: 'rgba(0,0,0,0.87)'
            }
        },
        MuiFab: {
            sizeSmall: {
                width: 36,
                height: 36,
                [breakpoints.up("sm")]: {
                    width: 40,
                    height: 40
                },
                [breakpoints.up("md")]: {
                    width: 48,
                    height: 48
                }
            }
        },
        MuiSvgIcon: {
            root: {
                fontSize: 18,
                [breakpoints.up("sm")]: {
                    fontSize: 22
                },
                [breakpoints.up("md")]: {
                    width: 28,
                    height: 28
                }
            },
            fontSizeLarge: {
                width: 64,
                height: 64,
                [breakpoints.up("sm")]: {
                    width: 102,
                    height: 102
                },
                [breakpoints.up("md")]: {
                    width: 192,
                    height: 192
                },
                [breakpoints.up("lg")]: {
                    width: 212,
                    height: 212
                }
            }
        },
        MuiDialogContent: {
            root: {
                [breakpoints.up('md')]: {
                    margin: '4px',
                },
                color: 'rgba(0,0,0,0.8)'
            }
        },
        MuiButton: {
            outlined: {
                color: 'rgb(244, 67, 54)',
                border: '1px solid rgba(244, 67, 54, 0.23);'
            }
        },
        MuiCheckbox: {
            root: {
                color: 'rgba(64, 64, 64, 0.5)'
            }
        },
        MuiDialogContentText: {
            root: {
                color: '#457B82'
            }
        }
    }
});

const store = configureStore({
    reducer: rootReducer,
    middleware: [...getDefaultMiddleware(), actionValidator, multiplayerActionRelay, gameplayLogger]
});

ReactDOM.render(
    <Provider store={store}>
        <MuiThemeProvider theme={theme}>
            <App />
        </MuiThemeProvider>
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

if (typeof window.Android !== 'undefined') {
    window.handleBattlechocPushMessage = (payload) => {
        console.log("handleBattlechocPushMessage called " + JSON.stringify(payload));
        multiplayer.handlePushMessage(payload);
    }
}
