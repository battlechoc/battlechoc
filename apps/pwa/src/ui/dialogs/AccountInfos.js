import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { changeLanguage } from '../UiActions';
//import firebase from 'firebase/app';
import 'firebase/auth';
import withMobileDialog from '@material-ui/core/withMobileDialog';
import Dialog from '@material-ui/core/Dialog';
import { Jukebox, Translation as t } from '../misc';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogActions from '@material-ui/core/DialogActions';
import Button from '@material-ui/core/Button';

class AccountInfos extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            open: false
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
            <Dialog
                fullWidth={true}
                fullScreen={this.props.fullScreen}
                open={this.state.open}
                onClose={() => this.setState({ open: false, attentionTextVisible: false })}
                aria-labelledby="accountInfosDialogTitle">
                <DialogTitle id="accountInfosDialogTitle">{t[this.props.language].ACCOUNTINFOS}</DialogTitle>
                <DialogContent>{t[this.props.language].ACCOUNTINFOS_PREVIEW}</DialogContent>
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

AccountInfos.propTypes = {
    fullScreen: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    language: state.ui.language
});

const mapDispatchToProps = {
    changeLanguage
};

const AccountInfosContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(AccountInfos);

export default withMobileDialog({ breakpoint: 'sm' })(AccountInfosContainer);