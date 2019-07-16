import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { notifyPlayerSignedIn } from '../UiActions';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
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
        multiplayer.registerNotifyPlayerSignedInAction(this.props.notifyPlayerSignedIn);
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
        console.log(this.props.playerInfos);
        if (this.props.playerInfos.isAnonymous === false) {
            return (
                <Dialog
                    fullWidth={true}
                    fullScreen={this.props.fullScreen}
                    open={this.state.open}
                    onClose={() => this.setState({ open: false, attentionTextVisible: false })}
                    aria-labelledby="signInOrUpDialogTitle">
                    <DialogTitle id="signInOrUpDialogTitle">{t[this.props.language].ACCOUNTINFOS}</DialogTitle>
                    <DialogContent>
                        Welcome: {this.props.playerInfos.name}<br/>
                        E-Mail: {this.props.playerInfos.email}<br/>
                        Coins: {this.props.playerInfos.coins}
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
                        <StyledFirebaseAuth uiConfig={uiConfig} firebaseAuth={firebase.auth()} />
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