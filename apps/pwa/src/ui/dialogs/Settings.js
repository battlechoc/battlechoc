import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { changeLanguage, updatePlayerStats, hideQuickMessage, showQuickMessage } from '../UiActions';
import { Jukebox, Translation as t } from '../misc';
import OfflineStore from '../../OfflineStore';
import Typography from '@material-ui/core/Typography';
import InputLabel from '@material-ui/core/InputLabel';
import FormControl from '@material-ui/core/FormControl';
import CircularProgress from '@material-ui/core/CircularProgress';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Select from '@material-ui/core/Select';
import Checkbox from '@material-ui/core/Checkbox';
import TextField from '@material-ui/core/TextField';
import { ServerRequest } from '../../helper/settings';
import PlayerNameInput from '../controls/PlayerNameInput';
import logger from '../../helper/logger';
import { makeStyles } from '@material-ui/core/styles';
import Fab from '@material-ui/core/Fab';
import { Edit, AccountCircle } from '@material-ui/icons';
import BattlechocDialog from './BattlechocDialog';

const useStyles = makeStyles(theme => ({
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
      marginTop: '4vh',
      textAlign: 'center',
      color: '#f3f7df',
      userSelect: 'none',
      textShadow: '1px 1px 3px #000',
      textTransform: 'uppercase'
    },
    inactiveButton: {
      backgroundColor: '#555 !important',
    },
    dialogContent: {
      [theme.breakpoints.up('sm')]: {
        width: '70vw',
        margin: '0 auto'
      }      
    },
    reportInformation: {
      marginTop: '4vh',
      color: theme.palette.primary.main
    },
    primaryColor: {
      color: theme.palette.primary.main
    }
}));

const Settings = props =>  {
  const [showErrorReport, setShowErrorReport] = useState(false);
  const [withDeviceInformation, setWithDeviceInformation] = useState(false);
  const [showAttentionText, setShowAttentionText] = useState(false);
  const [additionalReportMessage, setAdditionalReportMessage] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [editPlayerName, setEditPlayerName] = useState(false);

  const classes = useStyles();
  const setPlayerName = playerName => {
    ServerRequest('post', '/user/username', { username: playerName })
    .then(response => {        
      props.updatePlayerStats({ username: playerName });
      OfflineStore.playerStore.get('stats').then(playerStats => {
        playerStats.username = playerName;
        OfflineStore.playerStore.set('stats', playerStats);
        setEditPlayerName(false);
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
      <BattlechocDialog
        open={showErrorReport}
        close={() => { 
          setAdditionalReportMessage('');
          setWithDeviceInformation(false);
          setShowErrorReport(false) 
        }}
        title={t[props.language].REPORT_PROBLEM}>
        <div className={classes.dialogContent}>
          <form noValidate autoComplete="off">
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
              className={`${classes.userReport}`}
              inputProps={{className: classes.primaryColor }}
              variant="outlined"
              onChange={event => setAdditionalReportMessage(event.target.value)}
            />
          </form>
          <FormControlLabel
            className={classes.primaryColor}
            control={
              <Checkbox
                checked={withDeviceInformation}
                onChange={event => {
                  Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                  setWithDeviceInformation(event.target.checked);
                }}
              />
            }
            label={t[props.language].REPORT_DEVICE_INFO}
          />
          <div className={`${classes.menuButton} ${sendingReport ? classes.inactiveButton : ''}`} onClick={async () => {
            if (!sendingReport) {
              setSendingReport(true);
              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
              try {
                let gamestate = await OfflineStore.gamestateStore.get('gamestate');
                let report = {
                  deviceInformation: withDeviceInformation ? navigator.userAgent : undefined,
                  gamestate: gamestate,
                  player: props.playerInfos.stats.username,
                  message: additionalReportMessage,
                  logs: logger.summarize(),
                  report_date: (new Date()).getTime()
                };
                await ServerRequest('post', '/debugging/gamestate', { report: report });
                props.showQuickMessage({ 
                  text: t[props.language].SUCCESSFULLY_SENDING_PROBLEM_REPORT, 
                  variant: 'success' 
                });
              } catch(error) {
                logger.warn(error);
                props.showQuickMessage({ 
                  text: t[props.language].ERROR_SENDING_PROBLEM_REPORT, 
                  variant: 'error' 
                });
              } finally {
                setAdditionalReportMessage('')
                setWithDeviceInformation(false)
                setShowErrorReport(false);
                setSendingReport(false)
                props.close();
              }
            }
          }}>{sendingReport ? <CircularProgress style={{ filter: 'brightness(1.5)', height: '1rem'}} size={18} /> : t[props.language].REPORT_PROBLEM}</div>
          <Typography className={classes.reportInformation}>{t[props.language].REPORT_INFORMATION}</Typography>
        </div>
      </BattlechocDialog>

      <BattlechocDialog
        open={props.open}
        close={closeDialog}
        title={t[props.language].SETTINGS}>
        <div className={classes.dialogContent}>
          { 
            typeof props.playerInfos.stats.username !== 'undefined' && props.playerInfos.stats.username !== 'Chocnonymous' ?
              editPlayerName ? <PlayerNameInput setPlayerName={setPlayerName} current={props.playerInfos.stats.username} language={props.language}/> :
              <div className={classes.username}>
                <AccountCircle className={classes.accountCircle} /> { props.playerInfos.stats.username }
                <Fab onClick={() => setEditPlayerName(true)} className={classes.editUsername} size="small" color="primary"><Edit /></Fab>
              </div> : null
          }
          <FormControl style={{width: '100%'}}>
            <InputLabel htmlFor="lang-selection" style={{color: 'rgb(48, 86, 91)'}}>{t[props.language].LANGUAGE}</InputLabel>
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
        </div>
      </BattlechocDialog>
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