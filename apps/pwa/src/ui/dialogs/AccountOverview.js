import React from 'react';
import './AccountOverview.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { notifyPlayerSignedOut } from '../UiActions';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import * as firebaseui from 'firebaseui';
import { multiplayer } from '../../Multiplayer';
import firebase from 'firebase/app';
import 'firebase/auth';
import Dialog from '@material-ui/core/Dialog';
import { Jukebox, Translation as t } from '../misc';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Button from '@material-ui/core/Button';
import { AccountCircle, EmojiEvents, ThumbUp, ThumbDown, ThumbsUpDown, PlusOne, KeyboardArrowLeft as ArrowBackIcon } from '@material-ui/icons';
import { makeStyles } from '@material-ui/core/styles';
import Fab from '@material-ui/core/Fab';

const useStyles = makeStyles(theme => ({
  logoutButton: {
    color: '#f3f7df',
    borderColor: '#f3f7df'
  }
}));

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
                    multiplayer.mergePlayerStats();
                }).catch(signInErr => {
                    console.log("could not sign in with credentials after merge conflict during anonymous account upgrade. ", signInErr);
                })
            }
        }
    },
    signInOptions: [
        firebase.auth.GoogleAuthProvider.PROVIDER_ID,
        firebase.auth.FacebookAuthProvider.PROVIDER_ID, {
            provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
            requireDisplayName: false
        }
    ]
};

const AccountOverview = props => {
    const classes = useStyles();
    let signOut = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        multiplayer.signOut(props.notifyPlayerSignedOut);
    }

    let level = 0;
    if (typeof props.playerInfos.stats.level !== 'undefined') {
        level = Object.values(props.playerInfos.stats.level)
        .map(attributes => Object.values(attributes).reduce((level, prev) => Number(level) + Number(prev)))
        .reduce((value, prev) => value + prev);
    }

    let winnings = 0;
    let losses = 0;
    let drawn = 0;
    if (typeof props.playerInfos.stats.trackRecord !== 'undefined') {
        winnings = props.playerInfos.stats.trackRecord.filter(record => record.won).length;
        losses = props.playerInfos.stats.trackRecord.filter(record => record.lost).length;
        drawn = props.playerInfos.stats.trackRecord.filter(record => typeof record.winners !== 'undefined' && record.winners.length > 1).length;
    }

    React.useEffect(() => {
        multiplayer.computeRank();
    }, [props.open]);

    return (
        <Dialog
            fullWidth={true}
            fullScreen={true}
            open={props.open}
            PaperProps={{style: {
                background: 'rgb(235,235,235)',
                background: 'linear-gradient(0deg, rgba(235,235,235,1) 0%, rgba(232,218,198,1) 98%)'
            }}}
            onClose={() => props.close()}
            aria-labelledby="accountOverview"
            id="accountOverviewDialog">
            <DialogTitle id="accountOverviewTitle">
                <Fab
                    size="small"
                    color="primary"
                    aria-label="back"
                    onClick={() => {
                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                        props.close();
                    }}>
                    <ArrowBackIcon />
                </Fab>
                <span className="dialogTitleText accountInfoTitle">{ t[props.language].ACCOUNTINFOS }</span>
                <span className="dialogTitleText playerInfoTitle">{ props.playerInfos.stats.username }</span>
            </DialogTitle>
            <DialogContent>
                <div id="accountOverview">
                    <div className="accountAttribute"><AccountCircle /> { props.playerInfos.stats.username }</div>
                    
                    <div className="accountSubAttributes">
                        <div className="accountAttribute"><PlusOne />Level<span className="attributeValue">{ level }</span></div>
                        <div className="accountAttribute"><EmojiEvents />Rank<span className="attributeValue">{ props.ranking }</span></div>
                        <div className="accountAttribute"><ThumbUp />Won<span className="attributeValue">{ winnings }</span></div>
                        <div className="accountAttribute"><ThumbsUpDown />Drawn<span className="attributeValue">{ drawn }</span></div>
                        <div className="accountAttribute"><ThumbDown />Lost<span className="attributeValue">{losses }</span></div>
                        <div className="accountAttribute"><img src="images/coins.png" alt="choco coins" />Coins<span className="attributeValue">{ props.playerInfos.stats.coins }</span></div>
                    </div>

                    {(() => {
                        if (firebase.auth().currentUser) {
                            if (firebase.auth().currentUser.isAnonymous) {
                                return (
                                    <div className="infobox">
                                        <StyledFirebaseAuth uiConfig={FirebaseSigninUiConfig} firebaseAuth={firebase.auth()} />
                                        <p>To share your account across devices and restore your data if your device is lost, it's possible to connect it to one of these options</p>
                                    </div>
                                );
                            } else {
                                return (
                                    <div className="infobox">
                                        <p className="loggedinInfo">Your Account is associated with {props.playerInfos.email}</p>
                                        <Button className={classes.logoutButton} variant="outlined" onClick={signOut}>
                                            {t[props.language].SIGN_OUT}
                                        </Button>
                                    </div>
                                );
                            }
                        } else {
                            return <StyledFirebaseAuth uiConfig={FirebaseSigninUiConfig} firebaseAuth={firebase.auth()} />;
                        }
                    })()}
                </div>
            </DialogContent>
        </Dialog>
    );
};

AccountOverview.propTypes = {
    close: PropTypes.func.isRequired,
    open: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    language: state.ui.language,
    playerInfos: state.ui.playerInfos,
    ranking: state.ui.ranking
});

const mapDispatchToProps = {
    notifyPlayerSignedOut
};

const AccountOverviewContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(AccountOverview);

export default AccountOverviewContainer;