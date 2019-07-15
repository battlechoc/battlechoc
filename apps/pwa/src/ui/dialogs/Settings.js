import React, { Component } from 'react';
import './Settings.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { changeLanguage, showStatistics, notifyPlayerSignedOut, notifyPlayerSignedIn } from '../UiActions';
import { Jukebox, Translation as t } from '../misc';
import OfflineStore from '../../OfflineStore';
import withMobileDialog from '@material-ui/core/withMobileDialog';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import Typography from '@material-ui/core/Typography';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import InputLabel from '@material-ui/core/InputLabel';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Select from '@material-ui/core/Select';
import Snackbar from '@material-ui/core/Snackbar';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from '@material-ui/icons/Close';
import Checkbox from '@material-ui/core/Checkbox';
import TextField from '@material-ui/core/TextField';
import { multiplayer } from '../../Multiplayer';

class Settings extends Component {
  constructor(props) {
    super(props);
    this.state = {
      open: false,
      attentionTextVisible: false,
      showErrorReport: false,
      includeDeviceInformation: false,
      additionalReportMessage: '',
      snackbar: {
        visible: false,
        text: 'The problem report was sent successfully!'
      }
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
      <div>
        <Snackbar
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          open={this.state.snackbar.visible}
          autoHideDuration={4000}
          onClose={() => this.setState({
            snackbar: {
              text: this.state.snackbar.text,
              visible: false
            }
          })}
          ContentProps={{
            'aria-describedby': 'message-id',
          }}
          message={<span id="message-id">{this.state.snackbar.text}</span>}
          action={
            <IconButton
              key="close"
              aria-label="Close"
              color="inherit"
              onClick={() => this.setState({
                snackbar: {
                  text: this.state.snackbar.text,
                  visible: false
                }
              })}
            >
              <CloseIcon />
            </IconButton>
          }
        />

        <Dialog
          fullWidth={true}
          fullScreen={this.props.fullScreen}
          open={this.state.showErrorReport}
          onClose={() => this.setState({ additionalReportMessage: '', includeDeviceInformation: false, showErrorReport: false })}
          aria-labelledby="report-form-dialog-title"
        >
          <DialogTitle id="report-form-dialog-title">{t[this.props.language].REPORT_PROBLEM}</DialogTitle>
          <DialogContent>
            <form noValidate autoComplete="off">
              <Typography>{t[this.props.language].REPORT_INFORMATION}</Typography>
              <TextField
                label={t[this.props.language].REPORT_CUSTOM_MESSAGE}
                placeholder={t[this.props.language].REPORT_CUSTOM_MESSAGE_PLACEHOLDER}
                multiline
                fullWidth
                InputProps={{
                  style: { fontSize: '0.9rem' },
                }}
                InputLabelProps={{
                  style: { color: '#457B82' },
                  shrink: true
                }}
                className="additionalMessage"
                variant="outlined"
                onChange={event => this.setState({ additionalReportMessage: event.target.value })}
              />
            </form>
            <FormControlLabel
              control={
                <Checkbox
                  checked={this.state.includeDeviceInformation}
                  onChange={event => {
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    if (event.target.checked) {
                      this.setState({ includeDeviceInformation: true });
                    } else {
                      this.setState({ includeDeviceInformation: false });
                    }
                  }}
                />
              }
              label={t[this.props.language].REPORT_DEVICE_INFO}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => {
              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
              this.setState({ showErrorReport: false });
            }} color="primary">
              {t[this.props.language].BUTTON_BACK}
            </Button>
            <Button onClick={() => {
              Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
              OfflineStore.gamestateStore.get('gamestate').then(gamestate => {
                let report = {
                  deviceInformation: this.state.includeDeviceInformation ? navigator.userAgent : undefined,
                  gamestate: gamestate,
                  message: this.state.additionalReportMessage
                };

                let user = 'battlechoc-pwa';
                let password = '***REMOVED***';
                let auth = btoa(user + ':' + password);

                fetch('https://us-central1-battlechoc.cloudfunctions.net/api/debugging/gamestate', {
                  method: 'post',
                  headers: new Headers({
                    'Authorization': 'Basic ' + auth,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                  }),
                  body: JSON.stringify({ report: report })
                })
                  .then(response => response.json())
                  .then(data => this.setState({
                    snackbar: {
                      text: t[this.props.language].SNACKBAR_SEND,
                      visible: true
                    }
                  }));
                this.setState({ additionalReportMessage: '', includeDeviceInformation: false, showErrorReport: false });
              }).catch(error => {
                console.warn(error);
                this.setState({
                  additionalReportMessage: '',
                  includeDeviceInformation: false,
                  showErrorReport: false,
                  snackbar: {
                    text: t[this.props.language].SNACKBAR_ERROR,
                    visible: true
                  }
                });
              })
            }} color="primary">
              {t[this.props.language].REPORT_PROBLEM}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          fullWidth={true}
          fullScreen={this.props.fullScreen}
          open={this.state.open}
          onClose={() => this.setState({ open: false, attentionTextVisible: false })}
          aria-labelledby="settingsDialogTitle"
        >
          <DialogTitle id="settingsDialogTitle">{t[this.props.language].SETTINGS}</DialogTitle>
          <DialogContent>
            <FormControl id="settingsFormControl">
              <InputLabel htmlFor="lang-selection">{t[this.props.language].LANGUAGE}</InputLabel>
              <Select
                native
                value={this.props.language}
                onChange={event => {
                  Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                  this.props.changeLanguage(event.target.value);
                }}
                inputProps={{
                  name: 'language',
                  id: 'lang-selection',
                }}
              >
                <option value="en">{t[this.props.language].ENGLISH}</option>
                <option value="de">{t[this.props.language].GERMAN}</option>
              </Select>
              <Button className="dialogButton" color="secondary" variant="outlined" onClick={() => {
                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                this.setState({
                  open: false,
                  attentionTextVisible: false,
                  showErrorReport: true
                });
              }}>
                {t[this.props.language].REPORT_PROBLEM}
              </Button>
              {(() => {
                if (this.props.playerInfos.playerIsSignedIn === true) {
                  return (<Button className="dialogButton" color="secondary" variant="outlined" onClick={() => {
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    multiplayer.signOut(this.props.notifyPlayerSignedOut);
                  }}>
                    {t[this.props.language].SIGN_OUT}
                  </Button>);
                }
              })()}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={this.props.statistics}
                    onChange={event => {
                      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                      if (event.target.checked) {
                        document.getElementsByClassName('rs-base')[0].style.display = 'block';
                        this.props.showStatistics(true);
                      } else {
                        document.getElementsByClassName('rs-base')[0].style.display = 'none';
                        this.props.showStatistics(false);
                      }
                    }}
                  />
                }
                label="Development Statistics"
              />
              {
                typeof this.props.game !== 'undefined' ?
                  <Button variant="outlined" className="dialogButton" onClick={() => {
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    if (this.state.attentionTextVisible) {
                      this.props.endGame();
                      this.setState({ open: false, attentionTextVisible: false });
                    } else {
                      this.setState({ attentionTextVisible: true });
                    }
                  }}>
                    {t[this.props.language].SETTINGS_QUIT}
                  </Button>
                  : null
              }
              {
                this.state.attentionTextVisible && typeof this.props.game !== 'undefined' ?
                  <Typography color="error" className="attentionText">{t[this.props.language].SETTINGS_ATTENTION_TEXT}</Typography>
                  : null
              }
            </FormControl>
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
      </div>
    );
  }
}

Settings.propTypes = {
  fullScreen: PropTypes.bool.isRequired,
  endGame: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  game: state.gameplay.game,
  language: state.ui.language,
  statistics: state.ui.statistics,
  playerInfos: state.ui.playerInfos
});

const mapDispatchToProps = {
  changeLanguage,
  showStatistics,
  notifyPlayerSignedIn,
  notifyPlayerSignedOut
};

const SettingsContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(Settings);

export default withMobileDialog({ breakpoint: 'sm' })(SettingsContainer);