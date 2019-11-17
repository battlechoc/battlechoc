import React, { useState } from 'react';
import './Settings.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { changeLanguage, updatePlayerStats, hideQuickMessage, showQuickMessage } from '../UiActions';
import { Jukebox, Translation as t } from '../misc';
import OfflineStore from '../../OfflineStore';
import Dialog from '@material-ui/core/Dialog';
import Typography from '@material-ui/core/Typography';
import DialogContent from '@material-ui/core/DialogContent';
import InputLabel from '@material-ui/core/InputLabel';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Select from '@material-ui/core/Select';
import Checkbox from '@material-ui/core/Checkbox';
import TextField from '@material-ui/core/TextField';
import { ServerRequest } from '../../helper/settings';
import PlayerNameInput from '../controls/PlayerNameInput';
import logger from '../../helper/logger';
import { makeStyles } from '@material-ui/core/styles';
import Fab from '@material-ui/core/Fab';
import { Edit, AccountCircle, KeyboardArrowLeft as ArrowBackIcon } from '@material-ui/icons';

const useStyles = makeStyles(theme => ({
    header: {
        backgroundColor: '#324D5C',
        boxShadow: '1px 1px 6px #000',
        color: 'white',
        textShadow: '1px 1px 3px #000',
        padding: '8px'
    },
    headline: {
      marginLeft: '5vw'
    },
    userReport: {
      margin: '20px 0 10px 0'
    },
    username: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      userSelect: 'none',
      fontSize: '5vw',
      color: 'rgba(9, 63, 70, 0.8)',
      fontWeight: 'bolder',
      padding: '2vh'
    },
    editUsername: {
      marginLeft: '5vw'
    },
    accountCircle: {
      height: '5vw',
      width: '5vw',
      marginLeft: '1vw'
    },
    logoutButton: {
        color: '#f3f7df',
        borderColor: '#f3f7df'
    },
    menuButton: {
      cursor: 'pointer',
      padding: '12px',
      backgroundColor: '#5b2f19',
      boxShadow: '1px 1px 6px #000',
      fontSize: '1rem',
      margin: '2vh 0',
      textAlign: 'center',
      color: '#f3f7df',
      userSelect: 'none',
      textShadow: '1px 1px 3px #000',
      textTransform: 'uppercase'
    }
}));

const Settings = props =>  {
  const [showErrorReport, setShowErrorReport] = useState(false);
  const [withDeviceInformation, setWithDeviceInformation] = useState(false);
  const [showAttentionText, setShowAttentionText] = useState(false);
  const [additionalReportMessage, setAdditionalReportMessage] = useState(false);
  const [editPlayerName, setEditPlayerName] = useState(false);

  const classes = useStyles();
  const setPlayerName = playerName => {
    ServerRequest('post', '/user/username', { username: playerName })
    .then(response => {        
      props.updatePlayerStats({ username: playerName });
      OfflineStore.playerStore.get('stats').then(playerStats => {
        playerStats.username = playerName;
        OfflineStore.playerStore.set('stats', playerStats);
        props.close();
      })
    }).catch(error => console.warn(error));
  }

  const closeDialog = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    props.close();
    setShowAttentionText(false);
    setShowErrorReport(false);
  }

  return (
    <div>
      <Dialog
        fullWidth={true}
        fullScreen={true}
        open={showErrorReport}
        PaperProps={{style: {
          background: 'linear-gradient(0deg, rgba(255,255,255,1) 0%, rgba(252,238,228,1) 98%)'
        }}}
        onClose={() => { 
          setAdditionalReportMessage('');
          setWithDeviceInformation(false);
          setShowErrorReport(false) 
        }}
      >
        <DialogTitle className={classes.header}>
          <Fab
              size="small"
              color="primary"
              aria-label="back"
              onClick={() => {
                  Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                  setShowErrorReport(false);
              }}>
              <ArrowBackIcon />
          </Fab>
          <span className={classes.headline}>{t[props.language].REPORT_PROBLEM}</span>
        </DialogTitle>
        <DialogContent>
          <form noValidate autoComplete="off">
            <Typography>{t[props.language].REPORT_INFORMATION}</Typography>
            <TextField
              label={t[props.language].REPORT_CUSTOM_MESSAGE}
              placeholder={t[props.language].REPORT_CUSTOM_MESSAGE_PLACEHOLDER}
              multiline
              fullWidth
              InputProps={{ style: { fontSize: '0.9rem' } }}
              InputLabelProps={{
                style: { color: '#457B82' },
                shrink: true
              }}
              className={classes.userReport}
              variant="outlined"
              onChange={event => setAdditionalReportMessage(event.target.value)}
            />
          </form>
          <FormControlLabel
            control={
              <Checkbox
                checked={withDeviceInformation}
                onChange={event => {
                  Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                  if (event.target.checked) {
                    setWithDeviceInformation(true);
                  } else {
                    setWithDeviceInformation(false);
                  }
                }}
              />
            }
            label={t[props.language].REPORT_DEVICE_INFO}
          />
          <div className={classes.menuButton} onClick={async () => {
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
            try {
              let gamestate = await OfflineStore.gamestateStore.get('gamestate');
              let report = {
                deviceInformation: withDeviceInformation ? navigator.userAgent : undefined,
                gamestate: gamestate,
                message: additionalReportMessage,
                logs: logger.summarize()
              };
              await ServerRequest('post', '/debugging/gamestate', { report: report })
            } catch(error) {
              logger.warn(error);
              props.showQuickMessage({ 
                text: t[props.language].ERROR_SENDING_PROBLEM_REPORT, 
                variant: 'error' 
              });
            }
            setAdditionalReportMessage('')
            setWithDeviceInformation(false)
            setShowErrorReport(false);
          }}>{t[props.language].REPORT_PROBLEM}</div>
        </DialogContent>
      </Dialog>

      <Dialog
        fullWidth={true}
        fullScreen={true}
        open={props.open}
        PaperProps={{style: {
          background: 'linear-gradient(0deg, rgba(255,255,255,1) 0%, rgba(252,238,228,1) 98%)'
        }}}
        onClose={closeDialog}>
        <DialogTitle className={classes.header}>
          <Fab color="primary" size="small" onClick={closeDialog}>
              <ArrowBackIcon />
          </Fab>
          <span className={classes.headline}>{t[props.language].SETTINGS}</span>
        </DialogTitle>
        <DialogContent>
          { editPlayerName ? <PlayerNameInput setPlayerName={setPlayerName} current={props.playerInfos.stats.username} language={props.language}/> :
            <div className={classes.username}>
              <AccountCircle className={classes.accountCircle} /> { props.playerInfos.stats.username }
              <Fab onClick={() => setEditPlayerName(true)} className={classes.editUsername} size="small" color="primary"><Edit /></Fab>
            </div>
          }
          <FormControl id="settingsFormControl">
            <InputLabel htmlFor="lang-selection">{t[props.language].LANGUAGE}</InputLabel>
            <Select
              native
              value={props.language}
              onChange={event => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                props.changeLanguage(event.target.value);
              }}
              inputProps={{ name: 'language', id: 'lang-selection' }}>
              <option value="en">{t[props.language].ENGLISH}</option>
              <option value="de">{t[props.language].GERMAN}</option>
            </Select>
            <div className={classes.menuButton} onClick={() => {
              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
              props.close();
              setShowAttentionText(false);
              setShowErrorReport(true);
            }}>{t[props.language].REPORT_PROBLEM}</div>
            {(() => {
              if (props.playerInfos.stats.username !== 'Chocnonymous' && typeof props.game === 'undefined') {
                return (
                  <div>
                    <div className={classes.menuButton} onClick={() => {
                      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                      props.startTutorial();
                      props.close();
                      setShowAttentionText(false);
                    }}>{t[props.language].RESTART_TUTORIAL}</div>
                  </div>
                )
              }
            })()}

            { typeof props.game !== 'undefined' && !props.tutorial ?
                <div className={classes.menuButton} onClick={() => {
                  Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                  if (showAttentionText) {
                    props.surrender();
                    props.close();
                    setShowAttentionText(false);
                  } else {
                    setShowAttentionText(true);
                  }
                }}>{t[props.language].SETTINGS_QUIT}</div> : null
            }
            {
              showAttentionText && typeof props.game !== 'undefined' ?
                <Typography color="error" className="attentionText">{t[props.language].SETTINGS_ATTENTION_TEXT}</Typography>
                : null
            }
          </FormControl>
        </DialogContent>
      </Dialog>
    </div>
  );
}

Settings.propTypes = {
  open: PropTypes.bool.isRequired,
  close: PropTypes.func.isRequired,
  surrender: PropTypes.func.isRequired,
  startTutorial: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  game: state.gameplay.game,
  language: state.ui.language,
  playerInfos: state.ui.playerInfos,
  tutorial: state.ui.tutorial,
});

const mapDispatchToProps = {
  changeLanguage,
  updatePlayerStats,
  hideQuickMessage, 
  showQuickMessage
};

const SettingsContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Settings);

export default SettingsContainer;