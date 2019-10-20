import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { notifyPlayerSignedIn } from '../UiActions';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import * as firebaseui from 'firebaseui';
import { multiplayer } from '../../Multiplayer';
import firebase from 'firebase/app';
import 'firebase/auth';
import withMobileDialog from '@material-ui/core/withMobileDialog';
import Dialog from '@material-ui/core/Dialog';
import { Jukebox, Translation as t } from '../misc';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogActions from '@material-ui/core/DialogActions';
import Button from '@material-ui/core/Button';
import { ServerConfig } from '../../helper/settings';

const FirebaseSigninUiConfig = {
    signInFlow: 'popup',
    autoUpgradeAnonymousUsers: true,
    credentialHelper: firebaseui.auth.CredentialHelper.NONE,
    callbacks: {
        signInSuccessWithAuthResult: (authResult) => { 
            multiplayer.authStateChanged(authResult.user);
            return false;
        },
        signInFailure: (err) => {
            if (err.code === "firebaseui/anonymous-upgrade-merge-conflict") {
                firebase.auth().signInWithCredential(err.credential).then(() => {
                    multiplayer.mergeAccounts();
                }).catch(signInErr => {
                    console.log("could not sign in with credentials after merge conflict during anonymous account upgrade. ", signInErr);
                })
            }
        }
    },
    signInOptions: [
        firebase.auth.GoogleAuthProvider.PROVIDER_ID,
        firebase.auth.FacebookAuthProvider.PROVIDER_ID,
        {
            provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
            requireDisplayName: false
        }
    ]
};

class SignInOrUp extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            open: false
        }
        multiplayer.registerCallbacks({ notifyPlayerSignedIn: this.props.notifyPlayerSignedIn });
    }

    componentDidMount() {
        this.props.onRef(this);
    }

    handleFetchError(response) {
        if (!response.ok) {
            throw Error(response.statusText);
        }
        return response.json();
    }

    open = () => {
        this.setState({ open: true });

        const user = firebase.auth().currentUser;
        if (user) {
            fetch(ServerConfig.baseUrl + '/rank/' + user.uid, {            
                headers: new Headers({
                    'Authorization': 'Basic ' + ServerConfig.auth,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                })
            }).then(response => this.handleFetchError(response))
            .then(data => {
                this.setState({ ranking: data.ranking });
            }).catch(error => this.setState({ ranking: 'Offline'}));
        }
    }

    handleClose = () => {
        this.setState({ open: false })
    }

    render() {
        if (!this.props.playerInfos.isAnonymous) {
            return (
                <Dialog
                    fullWidth={true}
                    fullScreen={this.props.fullScreen}
                    open={this.state.open}
                    onClose={() => this.setState({ open: false, attentionTextVisible: false })}
                    aria-labelledby="signInOrUpDialogTitle">
                    <DialogTitle id="signInOrUpDialogTitle">{t[this.props.language].ACCOUNTINFOS}</DialogTitle>
                    <DialogContent>
                        Player Name: {this.props.playerInfos.stats.username}<br />
                        E-Mail: {this.props.playerInfos.email}<br />
                        Coins: {this.props.playerInfos.stats.coins}<br />
                        Rank: {this.state.ranking}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ open: false, attentionTextVisible: false })
                        }} color="primary">
                            {t[this.props.language].BUTTON_BACK}
                        </Button>
                    </DialogActions>
                </Dialog>
            );
        } else {
            return (
                <Dialog
                    fullWidth={true}
                    fullScreen={this.props.fullScreen}
                    open={this.state.open}
                    onClose={() => this.setState({ open: false, attentionTextVisible: false })}
                    aria-labelledby="signInOrUpDialogTitle">
                    <DialogTitle id="signInOrUpDialogTitle">{t[this.props.language].SIGNINORUP}</DialogTitle>
                    <DialogContent>
                        <StyledFirebaseAuth uiConfig={FirebaseSigninUiConfig} firebaseAuth={firebase.auth()} />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => {
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                            this.setState({ open: false, attentionTextVisible: false })
                        }} color="primary">
                            {t[this.props.language].BUTTON_BACK}
                        </Button>
                    </DialogActions>
                </Dialog>
            );
        }
    }
}

SignInOrUp.propTypes = {
    fullScreen: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    language: state.ui.language,
    playerInfos: state.ui.playerInfos
});

const mapDispatchToProps = {
    notifyPlayerSignedIn
};

const SignInOrUpContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(SignInOrUp);

export default withMobileDialog({ breakpoint: 'sm' })(SignInOrUpContainer);