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
            marginRight: theme.spacing(1),
            [theme.breakpoints.down('xs')]: {
                display: 'none'
            }
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
        }
    }));

    const classes = useStyles();
    const { open, message, onClose, variant } = props;
    const Icon = variantIcon[variant];

    return (
        <Snackbar
           anchorOrigin={{
              vertical: 'top',
              horizontal: 'center',
            }}
            open={open}
            autoHideDuration={4000}
            className={classes.anchorOriginTopCenter}
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
    message: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
    variant: PropTypes.oneOf(['error', 'info', 'success', 'warning']),
};

QuickMessage.defaultProps = {
    variant: 'warning'
}

export default QuickMessage;