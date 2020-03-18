import React, { useState } from 'react';
import './AccountOverview.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { notifyPlayerSignedOut } from '../UiActions';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import * as firebaseui from 'firebaseui';
import { multiplayer } from '../../Multiplayer';
import firebase from 'firebase/app';
import 'firebase/auth';
import { Jukebox, translate as t } from '../misc';
import Button from '@material-ui/core/Button';
import { AccountCircle, PlayArrow, HourglassEmpty, PersonAddDisabled, PersonAdd, EmojiEvents, ThumbUp, ThumbDown, ThumbsUpDown, PlusOne } from '@material-ui/icons';
import { makeStyles } from '@material-ui/core/styles';
import CircularProgress from '@material-ui/core/CircularProgress';
import BattlechocDialog from './BattlechocDialog';
import useMediaQuery from '@material-ui/core/useMediaQuery';
import { EmptyPlayerStats } from 'battlechoc-shared-functions';

const useStyles = makeStyles(theme => ({
    logoutButton: {
        color: '#f3f7df',
        borderColor: '#f3f7df'
    },
    menuButton: {
        cursor: 'pointer',
        padding: '12px',
        backgroundColor: '#5b2f19',
        boxShadow: '1px 1px 6px #000',
        margin: '1vh',
        minWidth: '50vw',
        textAlign: 'center',
        color: '#f3f7df',
        userSelect: 'none',
        fontSize: '1rem',
        textShadow: '1px 1px 3px #000',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        '@media screen and (max-width: 399px)': {
            minWidth: '70vw',
            fontSize: '0.8rem'
        },
        '@media screen and (min-width: 400px)': {
            minWidth: '50vw',
            fontSize: '0.8rem'
        },
        '@media screen and (min-width: 500px)': {
            fontSize: '0.8rem'
        },
        '@media screen and (min-width: 600px)': {
            minWidth: '40vw',
            fontSize: '0.9rem'
        },
        '@media screen and (min-width: 900px)': {
            minWidth: '30vw'
        }
    },
    pendingButton: {
        backgroundColor: '#777'
    },
    opponentActions: {
        display: 'flex',
        flexDirection: 'column',
        '@media screen and (max-height: 400px) and (orientation: landscape)': {
          marginTop: '5vh'
        }
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

    let isPlayerAccount = typeof props.playerAccount === 'undefined'; 

    let level = 0;
    let winnings = 0;
    let losses = 0;
    let drawn = 0;
    let loggedIn = false;
    let playerName = 'Chocnonymous';
    let ranking = 0;

    React.useEffect(() => {
        if (typeof props.playerAccount === 'undefined') {
            multiplayer.computeRank();
        }
    }, [props.open, props.playerAccount]);

    if (isPlayerAccount) {
        var signOut = () => {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            multiplayer.signOut(props.notifyPlayerSignedOut);
        }

        playerName = props.playerInfos.stats.username;
        ranking = props.ranking;

        if (typeof props.playerInfos.stats.level !== 'undefined') {
            level = Object.values(props.playerInfos.stats.level)
            .reduce((value, prev) => value + prev, 1);
        }

        if (firebase.auth().currentUser) {
            winnings = props.playerInfos.stats.winnings;
            drawn = props.playerInfos.stats.drawn;
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
        drawn = props.playerAccount.drawn;
        ranking = props.playerAccount.ranking;
    }

    return (
        <BattlechocDialog
            open={props.open}
            close={props.close}
            id="accountOverviewDialog"
            title={useMediaQuery('screen and (max-height: 600px)') ? playerName : t('ACCOUNTINFOS')}>
            <div className={isPlayerAccount ? 'accountOverview' : 'opponent accountOverview'}>
                <div className="accountAttribute"><AccountCircle /> { playerName }</div>
                {(() => {
                    if (typeof props.multiplayerSessions !== 'undefined' && !isPlayerAccount) {
                        let actions = [];
                        let gamesAgaistOpponent = props.multiplayerSessions.filter(session => session.opponent.name === playerName);
                        if (props.playerInfos.stats.username !== EmptyPlayerStats.username) {
                            if (gamesAgaistOpponent.length === 0) {
                                actions.push(<div key={0} className={classes.menuButton} onClick={() => {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    props.challengePlayer(playerName);
                                    props.close();
                                }}>
                                    <PlayArrow className={classes.actionIcon} />
                                    <span className={classes.actionTitle}>{t('START_GAME')}</span>
                                </div>);
                            } else {
                                actions.push(<div key={1} className={classes.menuButton} onClick={() => {
                                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                    props.joinGame(gamesAgaistOpponent[0].id);
                                    props.close();
                                }}>
                                    {gamesAgaistOpponent[0].myTurn ? <PlayArrow className={classes.actionIcon} /> : <HourglassEmpty className={classes.actionIcon} />}
                                    <span className={classes.actionTitle}>{t('JOIN_GAME')}</span>
                                </div>);
                            }
                    
                            if (!props.friends.map(friend => friend.name).includes(playerName)) {
                                actions.push(<div key={3} className={`${classes.menuButton} ${refreshFriend ? classes.pendingButton : ''}`} onClick={async () => {
                                    if (!refreshFriend) {
                                        setRefreshFriend(true);
                                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                        await props.addFriend(playerName);
                                        setRefreshFriend(false);
                                    }
                                }}>
                                    <PersonAdd className={classes.actionIcon} />
                                    <span className={classes.actionTitle}>{refreshFriend ? <CircularProgress style={{ filter: 'brightness(1.5)', height: '1rem'}} size={18} /> : t('ADD_FRIEND')}</span>
                                </div>);
                            } else {
                                actions.push(<div key={4} className={`${classes.menuButton} ${refreshFriend ? classes.pendingButton : ''}`} onClick={async () => {
                                    if (!refreshFriend) {
                                        setRefreshFriend(true);
                                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                        props.removeFriend(playerName);
                                        await props.addFriend(playerName);
                                        setRefreshFriend(false);
                                    }
                                }}>
                                    <PersonAddDisabled className={classes.actionIcon} />
                                    <span className={classes.actionTitle}>{refreshFriend ? <CircularProgress style={{ filter: 'brightness(1.5)', height: '1rem'}} size={18} /> : t('REMOVE_FRIEND')}</span>
                                </div>);
                            }

                            return <div className={classes.opponentActions}>{actions}</div>;
                        } else {
                            return <div className={classes.noAccountInfo} >{t('NO_ACCOUNT_INFO')}</div>;
                        }
                    }                        
                })()}

                <div className={'accountSubAttributes' + (loggedIn ? ' loggedIn' : '') + (isPlayerAccount ? '' : ' opponent')}>
                    <div className="accountAttribute"><PlusOne />{t('ACCOUNT_OVERVIEW_LEVEL')}<span className="attributeValue">{ level }</span></div>
                    <div className="accountAttribute"><EmojiEvents />{t('ACCOUNT_OVERVIEW_RANK')}<span className="attributeValue">{ ranking }</span></div>
                    <div className="accountAttribute"><ThumbUp />{t('ACCOUNT_OVERVIEW_WON')}<span className="attributeValue">{ winnings }</span></div>
                    <div className="accountAttribute"><ThumbsUpDown />{t('ACCOUNT_OVERVIEW_DRAWN')}<span className="attributeValue">{ drawn }</span></div>
                    <div className="accountAttribute"><ThumbDown />{t('ACCOUNT_OVERVIEW_LOST')}<span className="attributeValue">{losses }</span></div>
                    { isPlayerAccount ? <div className="accountAttribute">
                    <picture>
                      <source srcSet="/images/coins.webp" type="image/webp" />
                      <source srcSet="/images/coins.png" type="image/jpeg" /> 
                      <img src="/images/coins.png" alt="choco coins" />
                    </picture>
                    {t('ACCOUNT_OVERVIEW_COINS')}<span className="attributeValue">{ props.playerInfos.stats.coins }</span></div> : null }
                </div>

                { isPlayerAccount ? loggedIn ?    
                    <div className="infobox">
                        <p className="loggedinInfo">{t('ACCOUNT_OVERVIEW_ASSOCIATION')} {props.playerInfos.email}</p>
                        <Button className={classes.logoutButton} variant="outlined" onClick={signOut}>
                            {t('SIGN_OUT')}
                        </Button>
                    </div> :
                    <div className="infobox">
                        <StyledFirebaseAuth uiConfig={FirebaseSigninUiConfig} firebaseAuth={firebase.auth()} />
                        <p>{t('ACCOUNT_OVERVIEW_CREATE_INFO')}</p>
                    </div> : null                 
                }
            </div>
        </BattlechocDialog>
    );
};

AccountOverview.propTypes = {
    close: PropTypes.func.isRequired,
    open: PropTypes.bool.isRequired
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