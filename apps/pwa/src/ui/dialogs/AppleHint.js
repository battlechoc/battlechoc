import React, { Component } from 'react';
import AddBox from '@material-ui/icons/AddBox';
import ScreenRotation from '@material-ui/icons/ScreenRotation';
import OfflineStore from '../../OfflineStore';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from '@material-ui/icons/Close';
import SvgIcon from '@material-ui/core/SvgIcon';
import Snackbar from '@material-ui/core/Snackbar';

class AppleHint extends Component {
    constructor(props) {
        super(props);
        this.state = {
            visible: false
        }
    }

    componentDidMount() {
        let iOSDevice = /^(iPhone|iPad|iPod)/.test(navigator.platform);
        let isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        let isPWA = window.matchMedia('(display-mode: fullscreen)').matches;

        if (iOSDevice && !isFullscreen && !isPWA) {
            OfflineStore.settingsStore.get('iOSMessage').then(iOSMessage => {
                if (typeof iOSMessage === 'undefined') {
                    this.setState({ visible: true });
                }
            });
        }
    }

    render() {
        const message = this.props.message;
        const share = <SvgIcon fontSize="small"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" enableBackground="new 0 0 50 50"><meta name="license" content="https://commons.wikimedia.org/wiki/Category:Expat/MIT_License" /><meta name="copyright" content="Copyright © 2014 Alexander Madyankin, Roman Shamin" /><path d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z"/><path d="M24 7h2v21h-2z"/><path d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z"/></svg></SvgIcon>
        return (
            <Snackbar
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left'}}
                open={this.state.visible}
                className="iosMessage"
                onClose={() => {
                    this.setState({ visible: false});
                    OfflineStore.settingsStore.set("iOSMessage", "hide next time");
                }}
                message={<span>{message.substring(0, message.indexOf('[0]'))}<ScreenRotation />{message.substring(message.indexOf('[0]') + 3, message.indexOf('[1]'))}{share}{message.substring(message.indexOf('[1]') + 3, message.indexOf('[2]'))}<AddBox />{message.substring(message.indexOf('[2]') + 3)}</span>}
                action={
                    <IconButton
                        key="close"
                        aria-label="Close"
                        color="inherit"
                        onClick={() => {
                            this.setState({ visible: false});
                            OfflineStore.settingsStore.set("iOSMessage", "hide next time");
                        }}>
                        <CloseIcon />
                    </IconButton>
                }
            />
        );
    }
}

export default AppleHint;