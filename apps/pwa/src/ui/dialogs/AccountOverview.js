import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { createUseStyles } from 'react-jss';
import { connect } from 'react-redux';
import { notifyPlayerSignedOut } from '../UiActions';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import * as firebaseui from 'firebaseui';
import { multiplayer } from '../../Multiplayer';
import firebase from 'firebase/app';
import 'firebase/auth';
import logger from '../../helper/logger';
import { Jukebox, translate as t, keys as tr } from '../misc';
import { Button, Progress, Fab } from '../controls';
import Dialog from './Dialog';
import { EmptyPlayerStats } from 'battlechoc-shared-functions';

const useStyles = createUseStyles(theme => ({
    wrapper: {
        display: 'flex',
        flexDirection: 'column',
        marginTop: 16
    },
    pendingButton: {
        backgroundColor: '#777'
    },
    opponentActions: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        height: 140,
        marginBottom: 24
    },
    actionIcon: {
        padding: '0.5rem',
        border: '1px solid #f3f7df',
        borderRadius: '50%'
    },
    actionTitle: {
        display: 'flex',
        justifyContent: 'center',
        flexGrow: 1,
        marginLeft: '-0.5rem'
    },
    noAccountInfo: {
        width: '80vw',
        fontSize: '1.1rem',
        textAlign: 'center',
        color: 'rgba(9, 63, 70, 0.8)',
        fontWeight: 'bolder'
    },
    icon: {
        padding: 16,
        backgroundSize: '100% 100%'
    },
    attributes: {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        fontFamily: 'Bangers',
        fontSize: '1.2rem'
    },
    attribute: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        padding: 6,
        borderRadius: '100%',
        width: 80,
        height: 80,
        margin: 2
    },
    gold: {
        border: `3px solid ${theme.color.gold.light}`,
        background: `linear-gradient(0deg, ${theme.color.gold.dark} 0%, ${theme.color.gold.light} 100%)`
    },
    primary: {
        border: `3px solid ${theme.color.primary.light}`,
        background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 100%)`
    },
    secondary: {
        border: `3px solid ${theme.color.secondary.light}`,
        background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 100%)`
    },
    accent: {
        border: `3px solid ${theme.color.accent.light}`,
        background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 100%)`
    },
    signin: {
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
        fontFamily: 'Bangers',
        '& p': {
            fontSize: '0.8rem',
            fontFamily: 'Montserrat',
            width: '80%'
        },
        '& #firebaseui_container': {
            width: '100%'
        }
    }, 
    signout: {
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
        fontFamily: 'Bangers',
        '& p': {
            textAlign: 'center',
            fontSize: '1.6rem',
            '-webkit-text-stroke': '1px #1B4E69',
            '-webkit-font-smoothing': 'antialiased'
        }
    }, 
    firebaseUi: {
        '& .firebaseui-container': {
            background: 'unset',
            boxShadow: 'none',
            fontFamily: 'unset',
            '& .firebaseui-card-header': {
                border: 'none !important'
            },
            '& h1.firebaseui-title': {
                color: 'white'
            },
            '& label.firebaseui-label': {
                color: 'white'
            },
            '& input.firebaseui-input': {
                borderColor: 'rgba(255,255,255,.5)',
                color: 'white !important',
                padding: 6,
            },
            '& .firebaseui-label:after': {
                backgroundColor: 'rgba(255,255,255,0.5) !important'
            },
            '& button.mdl-button--primary': {
                color: 'white',
                borderRadius: '12.5%',
                lineHeight: 'unset',
                border: `3px solid ${theme.color.accent.light}`,
                background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 100%)`
            },
            '& button.mdl-button--raised': {
                borderRadius: '12.5%',
                lineHeight: 'unset',
                border: `3px solid ${theme.color.primary.light}`,
                background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 100%)`
            },
            '& .firebaseui-link': {
                color: theme.color.accent.light
            },
            '& .firebaseui-text': {
                color: 'white'
            }
        },
        '& .firebaseui-idp-button': {
            clipPath: 'url(#menu-button-clip-path)',
            fontFamily: 'Bangers',
            border: 'none !important',
            padding: 16,
            '& .firebaseui-idp-text': {
                fontSize: '1.2rem'
            }
        },
        '& .firebaseui-idp-facebook': {
            background: `linear-gradient(0deg, ${theme.color.facebook.dark} 0%, ${theme.color.facebook.light} 70%) !important`,
        },
        '& .firebaseui-idp-password': {
            background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 70%) !important`,
        },
        '& .firebaseui-idp-google': {
            background: `linear-gradient(0deg, #dedede 0%, #fff 70%) !important`
        }
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
    const [refreshFriend, setRefreshFriend] = useState(false);

    const isPlayerAccount = typeof props.playerAccount === 'undefined'; 

    let level = 0;
    let winnings = 0;
    let losses = 0;
    let loggedIn = false;
    let playerName = EmptyPlayerStats.username;
    let ranking = 0;

    React.useEffect(() => {
        if (typeof props.playerAccount === 'undefined') {
            multiplayer.computeRank();
        }
    }, [props.open, props.playerAccount]);

    const signOut = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        multiplayer.signOut(props.notifyPlayerSignedOut);
    }

    if (isPlayerAccount) {
        playerName = props.playerInfos.stats.username;
        ranking = props.ranking;

        if (typeof props.playerInfos.stats.level !== 'undefined') {
            level = Object.values(props.playerInfos.stats.level)
            .reduce((value, prev) => value + prev, 1);
        }

        if (firebase.auth().currentUser) {
            winnings = props.playerInfos.stats.winnings;
            losses = props.playerInfos.stats.losses;
        }

        if (firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous) {
            loggedIn = true;
        }
    } else {
        playerName = props.playerAccount.name;
        level = props.playerAccount.level;

        if (typeof level !== 'number') {
            level = 1;
        }

        winnings = props.playerAccount.winnings;
        losses = props.playerAccount.losses;
        ranking = props.playerAccount.ranking;
    }

    const createProfileLink = () => {
        const link = 'https://battlechoc.com/' + playerName;
        if (navigator.share) {
            navigator.share({
                title: window.document.title,
                text: t(tr.INVITATION),
                url: link,
            }).catch((error) => logger.info('error sharing multiplayer session', error));
        } else {
            let whatsappWindowRef = window.open();
            whatsappWindowRef.location = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(t(tr.INVITATION) + ' - ' + link);
        }
    }

    const share = playerName !== EmptyPlayerStats.username ? <Fab style={{ marginLeft: 12 }} icon="share" color="secondary" onClick={createProfileLink} /> : null;

    return (
        <Dialog
            open={props.open}
            icon="user"
            close={props.close}
            stacked={props.stackedStyle}
            id="accountOverviewDialog"
            autoscale={true}
            title={playerName.length > 15 ? `${playerName.slice(0, 14)}...` : playerName}
            titleSlot={share}>
            <div className={classes.wrapper}>
                {(() => {
                    if (typeof props.multiplayerSessions !== 'undefined' && !isPlayerAccount) {
                        const actions = [];
                        const gamesAgaistOpponent = props.multiplayerSessions.filter(session => session.opponent.name === playerName);
                        if (props.playerInfos.stats.username !== EmptyPlayerStats.username) {
                            if (gamesAgaistOpponent.length === 0) {
                                actions.push(<Button key={0} color="secondary" onClick={() => {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    props.challengePlayer(playerName);
                                    props.close();
                                }}>{t(tr.START_GAME)}</Button>);
                            } else {
                                actions.push(<Button key={1} color="secondary" onClick={() => {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    props.joinGame(gamesAgaistOpponent[0].id);
                                    props.close();
                                }}>{t(tr.JOIN_GAME)}</Button>);
                            }
                    
                            if (!props.friends.map(friend => friend.name).includes(playerName)) {
                                actions.push(<Button key={2} className={`${refreshFriend ? classes.pendingButton : ''}`} onClick={async () => {
                                    if (!refreshFriend) {
                                        setRefreshFriend(true);
                                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                        await props.addFriend(playerName);
                                        setRefreshFriend(false);
                                    }
                                }}>{refreshFriend ? <Progress infiniteAnimation size={24} /> : t(tr.ADD_FRIEND)}</Button>);
                            } else {
                                actions.push(<Button key={3} color="accent" className={`${refreshFriend ? classes.pendingButton : ''}`} onClick={async () => {
                                    if (!refreshFriend) {
                                        setRefreshFriend(true);
                                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                        props.removeFriend(playerName);
                                        await props.addFriend(playerName);
                                        setRefreshFriend(false);
                                    }
                                }}>{refreshFriend ? <Progress infiniteAnimation size={24} /> : t(tr.REMOVE_FRIEND)}</Button>);
                            }
                            return <div className={classes.opponentActions}>{actions}</div>;
                        } else {
                            return <div className={classes.noAccountInfo} >{t(tr.NO_ACCOUNT_INFO)}</div>;
                        }
                    }                        
                })()}

                <div className={classes.attributes}>
                    <div className={`${classes.gold} ${classes.attribute}`}>
                        <div className={ classes.icon } style={{ background: `url(/images/trophy.svg) no-repeat` }} />
                        <div>{t(tr.ACCOUNT_OVERVIEW_RANK)}</div><div>{ ranking }</div>
                    </div>
                    <div className={`${classes.primary} ${classes.attribute}`}>
                        <div className={ classes.icon } style={{ background: `url(/images/win.svg) no-repeat` }} />
                        <div>{t(tr.ACCOUNT_OVERVIEW_WON)}</div><div>{ winnings }</div>
                    </div>
                    <div className={`${classes.accent} ${classes.attribute}`}>
                        <div className={ classes.icon } style={{ background: `url(/images/lost.svg) no-repeat` }} />
                        <div>{t(tr.ACCOUNT_OVERVIEW_LOST)}</div><div>{losses }</div>
                    </div>
                    <div className={`${classes.gold} ${classes.attribute}`}>
                        <div className={ classes.icon } style={{ background: `url(/images/level.svg) no-repeat` }} />
                        <div>{t(tr.ACCOUNT_OVERVIEW_LEVEL)}</div><div>{ level }</div>
                    </div>
                </div>

                { isPlayerAccount ? loggedIn ?    
                    <div className={classes.signout}>
                        <p>{t(tr.ACCOUNT_OVERVIEW_ASSOCIATION)} {props.playerInfos.email}</p>
                        <Button color="accent" onClick={signOut}>{t(tr.SIGN_OUT)}</Button>
                    </div> :
                    <div className={classes.signin}>
                        <StyledFirebaseAuth className={classes.firebaseUi} uiConfig={FirebaseSigninUiConfig} firebaseAuth={firebase.auth()} />
                        <p>{t(tr.ACCOUNT_OVERVIEW_CREATE_INFO)}</p>
                    </div> : null                 
                }
            </div>
        </Dialog>
    );
};

AccountOverview.propTypes = {
    close: PropTypes.func.isRequired,
    open: PropTypes.bool.isRequired,
    stackedStyle: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    playerInfos: state.ui.playerInfos,
    ranking: state.ui.ranking,
    multiplayerSessions: state.ui.multiplayerSessions,
    friends: state.ui.friends
});

const mapDispatchToProps = {
    notifyPlayerSignedOut
};

const AccountOverviewContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(AccountOverview);

export default AccountOverviewContainer;