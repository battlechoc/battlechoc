import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './Tutorial.css';
import { connect } from 'react-redux';
import { AppBar, Toolbar, Typography, IconButton, TextField } from '@material-ui/core';
import { ArrowBackIos as ArrowBackIcon, ArrowForwardIos as ArrowForwardIcon, Done, Send, HourglassFull } from '@material-ui/icons';
import withMobileDialog from '@material-ui/core/withMobileDialog';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import Fab from '@material-ui/core/Fab';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import ChoosePage from './ChoosePage';
import BuildFactoryPage from './BuildFactoryPage';
import TreesAndCannonsPage from './TreesAndCannonsPage';
import BunnyAndXmasPage from './BunnyAndXmasPage';
import FountainAndFruitCannonPage from './FountainAndFruitCannonPage';
import { Jukebox } from '../ui/misc';
import ChoosePageTutorial from '../situations/tutorial/ChoosePageTutorial';
import FactoryTutorial from '../situations/tutorial/FactoryTutorial';
import TreeAndCannonTutorial from '../situations/tutorial/TreeAndCannonTutorial';
import BunnyAndXmasTutorial from '../situations/tutorial/BunnyAndXmasTutorial';
import FountainAndFruitCannonTutorial from '../situations/tutorial/FountainAndFruitCannonTutorial';
import { Translation as t } from '../ui/misc';
import { ServerConfig } from '../helper/settings';
import { makeStyles } from '@material-ui/core/styles';
import CircularProgress from '@material-ui/core/CircularProgress';
import { green } from '@material-ui/core/colors';
import withWidth, { isWidthUp } from '@material-ui/core/withWidth';
import firebase from '@firebase/app';
import OfflineStore from '../OfflineStore';
import { updatePlayerStats } from '../ui/UiActions';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    alignItems: 'center',
  },
  wrapper: {
    margin: theme.spacing(1),
    position: 'relative',
  },
  buttonSuccess: {
    backgroundColor: green[500],
    '&:hover': {
      backgroundColor: green[700],
    },
  },
  fabProgress: {
    color: '#324D5C',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  }
}));

const UserNameInput = withWidth()(props => {
    const classes = useStyles();
    const [loading, setLoading] = React.useState(false);
    const [playerNameValid, setPlayerNameValid] = React.useState(false);
    const [playerNameAvailable, setPlayerNameAvailable] = React.useState(false);
    const [playerName, setPlayerName] = React.useState('Chocnonymous');

    const buttonClassname = playerNameAvailable ? classes.buttonSuccess : null;

    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            let data = JSON.parse(xhr.responseText);
            if (xhr.status === 200) {
                setPlayerNameAvailable(data.available);
            } else {
                setPlayerNameAvailable(false);
            }
            setLoading(false);
        }
    };

    const checkAvailable = name => {
        if (xhr.readyState < 4) {
            xhr.abort();
        }
        xhr.open("GET", ServerConfig.baseUrl + '/check/available/' + name, true);
        xhr.setRequestHeader('Authorization', 'Basic ' + ServerConfig.auth);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send();
    }

    const validate = name => {
        let regex = /^([a-zA-Z][a-zA-Z0-9_]{3,15})$/;
        return regex.test(name) && name.toUpperCase() !== 'CHOCNONYMOUS';
    }

    const handleButtonClick = () => {
        if (playerNameAvailable && playerNameValid && !loading) {
            props.setPlayerName(playerName);
        }
    };

    const getHelperText = () => {
        if (loading) {
            return '';
        } else if (!playerNameAvailable) {
            return 'username already in use';
        } else if (!playerNameValid) {
            return 'username not valid (3-15 chars or digits, first sign should be a char)';
        } else {
            return '';
        }
    }

    return (
        <div className={classes.root}>
            <TextField
                label="Name"
                error={!playerNameAvailable || !playerNameValid}
                value={playerName}
                helperText={getHelperText()}
                inputProps={{ spellCheck: 'false' }}
                onChange={event => {
                    setPlayerName(event.target.value);
                    setPlayerNameAvailable(false);
                    setPlayerNameValid(false);
                    setLoading(true);
                    checkAvailable(event.target.value);
                    setPlayerNameValid(validate(event.target.value));
                }}
                margin="normal"
            />    
            <div className={classes.wrapper}>
                <Fab
                  disabled={loading || !playerNameAvailable || !playerNameValid}
                  aria-label="send"
                  color="primary"
                  size="small"
                  className={buttonClassname}
                  onClick={handleButtonClick}
                >
                  {loading ? <HourglassFull /> :  <Send />}
                </Fab>
                {loading && <CircularProgress size={isWidthUp('md', props.width) ? 48 : 40} className={classes.fabProgress} />}
            </div>
        </div>
    );
});

class Tutorial extends Component {
    constructor(props) {
        super(props);
        let username = 'Chocnonymous';
        console.log(this.props.playerStats)
        if (typeof this.props.playerStats !== 'undefined') {
            if (typeof this.props.playerStats.username !== 'undefined') {
                username = this.props.playerStats.username;
            }
        }
        this.state = {
            page: 0,
            open: false,
            maxPages: 5,
            playerHasName: username !== 'Chocnonymous',
        }
    }

    componentDidMount() {
        this.props.loadSituation(ChoosePageTutorial);
    }

    fulfilled = () => {
        if ((this.state.page + 1) === this.state.maxPages) {
            this.finishedTutorial();
        } else {
            this.next();
        }
    }

    next = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        if (this.state.page === 0) {
            this.props.loadSituation(FactoryTutorial);
        } else if (this.state.page === 1) {
            this.props.loadSituation(TreeAndCannonTutorial);
        } else if (this.state.page === 2) {
            this.props.loadSituation(BunnyAndXmasTutorial);
        } else if (this.state.page === 3) {
            this.props.loadSituation(FountainAndFruitCannonTutorial);
        } 
        this.setState({ page: this.state.page + 1});
    }

    back = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        if (this.state.page === 1) {
            this.props.loadSituation(ChoosePageTutorial);
        } else if (this.state.page === 2) {
            this.props.loadSituation(FactoryTutorial);
        } else if (this.state.page === 3) {
            this.props.loadSituation(TreeAndCannonTutorial);
        } else if (this.state.page === 4) {
            this.props.loadSituation(BunnyAndXmasTutorial);
        } 

        if (this.state.page > 0) {
            this.setState({ page: this.state.page - 1});
        }
    }

    finishedTutorial = () => {
        this.setState({ open: true });
    }

    closeTutorial = startGame => {
        if (this.state.playerHasName) {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            this.setState({ open: false });
            this.props.closeTutorial(startGame);
        }
    }

    setPlayerName = playerName => {
        fetch(ServerConfig.baseUrl + '/user/username', {
            method: 'post',
            headers: new Headers({
                'Authorization': 'Basic ' + ServerConfig.auth,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }),
            body: JSON.stringify({ 
                player: firebase.auth().currentUser.uid,
                username: playerName
            })
        }).then(response => {        
            console.log(response);
            this.props.updatePlayerStats({ 'name': playerName });
            console.log(playerName);
            OfflineStore.playerStore.get('stats').then(playerStats => {
                playerStats.name = playerName;
                OfflineStore.playerStore.set('stats', playerStats);
                console.log(playerStats);
            });
            this.setState({ playerHasName: true });
        }).catch(error => console.error(error));
    }

    render() {
        let backIcon = <IconButton color="inherit" aria-label="back" onClick={this.back}><ArrowBackIcon /></IconButton>
        let nextIcon = <IconButton color="inherit" aria-label="next" onClick={this.next}><ArrowForwardIcon /></IconButton>
        if (this.state.page === 0) {
            backIcon = null;
        }

        if (this.state.page >= this.state.maxPages - 1) {
            nextIcon = <IconButton color="inherit" aria-label="close tutorial" onClick={this.finishedTutorial}><Done /></IconButton>
        }

        let title = t[this.props.language].TUTORIAL_TITLE_1;
        if (this.state.page === 1) {
            title = t[this.props.language].TUTORIAL_TITLE_2;
        } else if (this.state.page === 2) {
            title = t[this.props.language].TUTORIAL_TITLE_3;
        } else if (this.state.page === 3) {
            title = t[this.props.language].TUTORIAL_TITLE_4;
        } else if (this.state.page === 4) {
            title = t[this.props.language].TUTORIAL_TITLE_5;
        }

        let appbar = <AppBar position="static" color="secondary" className="tutorialAppbar">
                        <Toolbar>
                          { backIcon }
                          <Typography variant="h6" className="tutorial-headline" color="inherit">
                          { title }
                          </Typography>
                          { nextIcon }
                        </Toolbar>
                     </AppBar>

        let pages = [
            <ChoosePage fulfilled={this.fulfilled} appbar={appbar}/>, 
            <BuildFactoryPage fulfilled={this.fulfilled} appbar={appbar}/>,
            <TreesAndCannonsPage fulfilled={this.fulfilled} appbar={appbar}/>,
            <BunnyAndXmasPage fulfilled={this.fulfilled} appbar={appbar}/>,
            <FountainAndFruitCannonPage fulfilled={this.fulfilled} appbar={appbar}/>
        ];

        let dialogTitle = "Du hast es fast geschafft"
        let dialogContent = [
            <Typography key="0" >Bevor wir starten solltest du dir unbedingt einen coolen Namen überlegen! Freunde können dich anhand deines Names wiederkennen und deine Gegner bringt er vielleicht zum Zittern.</Typography>,
            <UserNameInput key="1" setPlayerName={this.setPlayerName}/>
        ];
        let dialogActions = []

        if (this.state.playerHasName) {
            dialogTitle = t[this.props.language].TUTORIAL_DIALOG_TITLE;
            dialogContent = [
                <Typography key="0" >{t[this.props.language].TUTORIAL_DIALOG_MESSAGE}</Typography>,
                <Typography key="1" color="primary" className="hint">{"\u27AA " + t[this.props.language].TUTORIAL_DIALOG_HINT}</Typography>
            ];
            dialogActions = [
                <Button key="2" onClick={() => this.closeTutorial(false)} color="primary">
                    {t[this.props.language].TUTORIAL_DIALOG_BACK}
                </Button>,
                <Button key="3" onClick={() => this.closeTutorial(true)} color="primary">
                  {t[this.props.language].TUTORIAL_DIALOG_PLAY_GAME}
                </Button>
            ];
        }

        return (
            <div id="tutorial">
                {pages[this.state.page]}

                <Dialog
                  fullWidth={true}
                  fullScreen={this.props.fullScreen}
                  open={this.state.open}
                  onClose={this.closeTutorial}
                  aria-labelledby="report-form-dialog-title">
                    <DialogTitle>{ dialogTitle }</DialogTitle>
                    <DialogContent>{ dialogContent }</DialogContent>
                    <DialogActions>{ dialogActions }</DialogActions>
                </Dialog>

            </div>
        );
    }
}

Tutorial.propTypes = {
    closeTutorial: PropTypes.func.isRequired,
    loadSituation: PropTypes.func.isRequired
}

const mapStateToProps = state => ({ language: state.ui.language, playerStats: state.ui.playerStats });
const mapDispatchToProps = { updatePlayerStats };

const TutorialContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Tutorial);

export default withMobileDialog({ breakpoint: 'sm' })(TutorialContainer);