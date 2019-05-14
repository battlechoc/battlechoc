import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import rootReducer from './RootReducer';
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
    }
});

const { breakpoints } = defaultTheme

const theme = createMuiTheme({
	...defaultTheme,
  	overrides: {
	    MuiTypography: {
	    	h6: {
	        	fontSize: '0.7rem',
		    	[breakpoints.up("sm")]: {
			        fontSize: '0.8rem'
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
    			padding: '8px 64px'
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

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.register();
