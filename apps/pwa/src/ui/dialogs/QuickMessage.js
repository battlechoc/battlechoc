import React from 'react';
import PropTypes from 'prop-types';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import InfoIcon from '@material-ui/icons/Info';
import CloseIcon from '@material-ui/icons/Close';
import IconButton from '@material-ui/core/IconButton';
import Snackbar from '@material-ui/core/Snackbar';
import SnackbarContent from '@material-ui/core/SnackbarContent';
import WarningIcon from '@material-ui/icons/Warning';
import AddBox from '@material-ui/icons/AddBox';
import ScreenRotation from '@material-ui/icons/ScreenRotation';
import SvgIcon from '@material-ui/core/SvgIcon';
import { makeStyles } from '@material-ui/core/styles';

const variantIcon = {
    success: CheckCircleIcon,
    warning: WarningIcon,
    error: ErrorIcon,
    info: InfoIcon,
};

function QuickMessage(props) {
    const useStyles = makeStyles(theme => ({
        icon: {
            fontSize: 20
        },
        iconVariant: {
            opacity: 0.9,
            marginRight: theme.spacing(1)
        },
        message: {
            display: 'flex',
            alignItems: 'center',
        },
        anchorOriginTopCenter: {
            [theme.breakpoints.down('sm')]: {
                top: '8px',
                left: '8px',
                right: '8px',
                transform: 'unset',
            }
        },
        root: {
            backgroundColor: 'rgb(91,47,25)',
            [theme.breakpoints.down('sm')]: {
                flexGrow: 1,
                fontSize: '0.8em',
                padding: '6px 10px'
            }    
        },
        iosMessage: {
            '& button': { paddingBottom: 0 },
            '& span > span > svg': { marginBottom: -5 },
            '@media screen and (orientation:landscape)': { display: 'none' }
        }
    }));

    const classes = useStyles();
    let { open, message, onClose, variant } = props;
    let customStyle = '';

    if (variant === 'apple-pwa-hint') {
        variant = 'info';
        customStyle = classes.iosMessage;
        const share = <SvgIcon fontSize="small"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" enableBackground="new 0 0 50 50"><meta name="license" content="https://commons.wikimedia.org/wiki/Category:Expat/MIT_License" /><meta name="copyright" content="Copyright © 2014 Alexander Madyankin, Roman Shamin" /><path d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z"/><path d="M24 7h2v21h-2z"/><path d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z"/></svg></SvgIcon>
        message = <span>
            {message.substring(0, message.indexOf('[0]'))}
            <ScreenRotation />
            {message.substring(message.indexOf('[0]') + 3, message.indexOf('[1]'))}
            {share}
            {message.substring(message.indexOf('[1]') + 3, message.indexOf('[2]'))}
            <AddBox />
            {message.substring(message.indexOf('[2]') + 3)}
        </span>;
    }

    const Icon = variantIcon[variant];

    return (
        <Snackbar
           anchorOrigin={{
              vertical: 'top',
              horizontal: 'center',
            }}
            open={open}
            autoHideDuration={4000}
            className={`${classes.anchorOriginTopCenter} ${customStyle}`}
            onClose={onClose}
        >
            <SnackbarContent
                className={classes.root}
                aria-describedby="client-snackbar"
                message={
                  <span id="client-snackbar" className={classes.message}>
                    <Icon className={`${classes.icon} ${classes.iconVariant}`} />
                    {message}
                  </span>
                }
                action={[
                  <IconButton key="close" aria-label="close" color="inherit" onClick={onClose}>
                    <CloseIcon className={classes.icon} />
                  </IconButton>,
                ]}
            />
        </Snackbar>
    );
}

QuickMessage.propTypes = {
    open: PropTypes.bool.isRequired,
    message: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    variant: PropTypes.oneOf(['error', 'info', 'success', 'warning', 'apple-pwa-hint']),
};

QuickMessage.defaultProps = {
    variant: 'warning'
}

export default QuickMessage;