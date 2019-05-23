import React, { Component } from 'react';
import PropTypes from 'prop-types';
import './Info.css';
import { connect } from 'react-redux';
import Fab from '@material-ui/core/Fab';
import { InfoOutlined } from '@material-ui/icons';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import withMobileDialog from '@material-ui/core/withMobileDialog';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import t from '../Translation';
import Jukebox from '../Jukebox';

class Info extends Component {
    constructor(props) {
        super(props);
        this.state = {
            open : false
        }
    }

    handleClose = () => {
        this.setState({ open: false })
    }

    render() {
        if (this.props.isVisible) {
            return (
                <div className="info-dialog">
                    <Fab
                        size="small"
                        color="primary"
                        aria-label="info"
                        className="icon"
                        onClick={() => {
                            this.setState({ open: true });
                            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                        }}>
                        <InfoOutlined />
                    </Fab>
                    <Dialog
                      fullScreen={this.props.fullScreen}
                      open={this.state.open}
                      onClose={this.handleClose}
                      aria-labelledby="info-dialog-title"
                    >
                        <DialogTitle id="info-dialog-title">battlechoc - version 0.9-alpha</DialogTitle>
                        <DialogContent className="info-dialog-content">
                            <Typography variant="h5">{t[this.props.language].INFO_IMPRESS}</Typography>
                            <Typography>
                                battlechoc GbR<br />
                                Triftweg 5<br />
                                38550 Isenbüttel<br />
                                {t[this.props.language].INFO_IMPRESS_COUNTRY}<br /><br />
                                E-mail: info@battlechoc.com<br />
                                {t[this.props.language].INFO_IMPRESS_PHONE}: + 49 151 65486876<br /><br />
                                {t[this.props.language].INFO_IMPRESS_EXECUTIVE_DIRECTORS}: Dr. Sebastian Bode & Fabian Bormann
                            </Typography>
                            <Typography variant="h5">{t[this.props.language].INFO_PRIVACY_POLICY}</Typography>
                            <Typography>{t[this.props.language].INFO_PRIVACY_POLICY_TEXT}</Typography>
                            <Typography variant="h6">Google Web Analytics</Typography>
                            <Typography>{t[this.props.language].INFO_GOOGLE_ANALYTICS}</Typography>
                            <Typography component="ul">
                                <li>{t[this.props.language].INFO_GOOGLE_ANALYTICS_OPERATING_SYSTEM}</li>
                                <li>{t[this.props.language].INFO_GOOGLE_ANALYTICS_BROWSER_TYPE}</li>
                                <li>{t[this.props.language].INFO_GOOGLE_ANALYTICS_REFERRER_URL}</li>
                                <li>{t[this.props.language].INFO_GOOGLE_ANALYTICS_HOST_NAME}</li>
                                <li>{t[this.props.language].INFO_GOOGLE_ANALYTICS_SERVER_REQUEST}</li>
                            </Typography>
                            <Typography>{t[this.props.language].INFO_GOOGLE_ANALYTICS_PREVENT}</Typography>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => {
                                Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                                this.handleClose();
                            }} color="primary" autoFocus>
                                {t[this.props.language].BUTTON_BACK}
                            </Button>
                        </DialogActions>
                    </Dialog>
                </div>
            );
        } else {
            return null;
        }
    }
}

Info.propTypes = {
  fullScreen: PropTypes.bool.isRequired,
  isVisible: PropTypes.bool.isRequired
};

const mapStateToProps = state => ({
    language: state.ui.language
});

const InfoContainer = connect(
    mapStateToProps
)(Info);

export default withMobileDialog()(InfoContainer);