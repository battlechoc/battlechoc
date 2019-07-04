import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { changeLanguage } from '../UiActions';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import firebase from 'firebase';
import withMobileDialog from '@material-ui/core/withMobileDialog';
import Dialog from '@material-ui/core/Dialog';
import { Translation as t } from '../misc';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';

const uiConfig = {
    signInFlow: 'popup',
    callbacks: {
        signInSuccessWithAuthResult: () => false
    },
    signInOptions: [
        firebase.auth.GoogleAuthProvider.PROVIDER_ID,
        firebase.auth.FacebookAuthProvider.PROVIDER_ID,
        firebase.auth.EmailAuthProvider.PROVIDER_ID
    ]
};

class SignInOrUp extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            open: false
        }
    }

    componentDidMount() {
        this.props.onRef(this);
    }

    open = () => {
        this.setState({ open: true });
    }

    handleClose = () => {
        this.setState({ open: false })
    }

    render() {
        return (
            <Dialog
                fullWidth={true}
                fullScreen={this.props.fullScreen}
                open={this.state.open}
                onClose={() => this.setState({ open: false, attentionTextVisible: false })}
                aria-labelledby="settingsDialogTitle">
                <DialogTitle id="settingsDialogTitle">{t[this.props.language].SIGNINORUP}</DialogTitle>
                <DialogContent>
                    <StyledFirebaseAuth uiConfig={uiConfig} firebaseAuth={firebase.auth()} />
                </DialogContent>
            </Dialog>
        );
    }
}

SignInOrUp.propTypes = {
    fullScreen: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    language: state.ui.language
});

const mapDispatchToProps = {
  changeLanguage
};

const SignInOrUpContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(SignInOrUp);

export default withMobileDialog({ breakpoint: 'sm' })(SignInOrUpContainer);