import React, { useState } from 'react';
import { createUseStyles } from 'react-jss';
import Fab from '../controls/Fab';
import { Jukebox, translate as t, keys as tr, getCurrentLanguage } from '../misc';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import de from 'javascript-time-ago/locale/de';
import Dialog from './Dialog';

const useStyles = createUseStyles(() => ({
    icons: {
        position: 'absolute',
        zIndex: 2,
        bottom: 0,
        right: 0,
        marginBottom: 5,
        display: 'flex',
        '& > div': {
            marginRight: 5
        }
    },
    text: {
        '& *': { color: 'white' },
        '@media screen and (min-width: 960px)': {
            width: '80vw',
            margin: '0 auto'
        },
        '@media screen and (max-width: 600px)': {
            '& p': { fontSize: '0.8rem', margin: '0.5rem' },
            '& h2': { fontSize: '1.2rem', margin: '0.5rem' },
            '& h3': { fontSize: '1rem', margin: '0.5rem' }
        }
    }
}));

const Info = props => {
    const classes = useStyles();
    const [open, setOpen] = useState(props.openInfo);
    // GitLab CI is going to override these variables
    let date = 'LOCAL_DATETIME';
    let version = 'LOCAL_VERSION';

    if (date.startsWith('LOCAL')) {
        date = new Date().getTime();
    } else {
        date = new Date(date).getTime();
    }

    TimeAgo.addLocale(en);
    TimeAgo.addLocale(de);

    if (version.startsWith('LOCAL')) {
        version = 'latest-dev'
    }
    
    const handleClose = () => {
        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
        setOpen(false);
    }

    let timeAgo = new TimeAgo('en-US');
    let timeSinceUpdate = timeAgo.format(date);
    timeSinceUpdate = 'last update ' + timeSinceUpdate 

    if (getCurrentLanguage() === 'de') {
        timeAgo = new TimeAgo('de-DE');
        timeSinceUpdate = timeAgo.format(date);
        timeSinceUpdate = 'Letztes Update ' + timeSinceUpdate;
    }

    return (
        <>
            <div className={classes.icons}>
                <Fab
                    icon="instagram"
                    onClick={() =>
                        window.open("https://www.instagram.com/battlechoc/", "_blank")
                    }>
                </Fab>
                <Fab
                    icon="facebook"
                    onClick={() =>
                        window.open("https://fb.me/battlechoc", "_blank")
                    }>
                </Fab>
                <Fab
                    icon="info"
                    color="primary"
                    onClick={() => {
                        setOpen(true);
                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    }}>
                </Fab>
            </div>
            <Dialog
                open={open}
                close={handleClose}
                title="About battlechoc"
                subtitle={`${version} - ${timeSinceUpdate}`}>
                <div className={classes.text}>
                    <h2>{t(tr.INFO_IMPRESS)}</h2>
                    <p>
                        battlechoc GbR<br />
                        Triftweg 5<br />
                        38550 Isenbüttel<br />
                        {t(tr.INFO_IMPRESS_COUNTRY)}<br /><br />
                        E-mail: info@battlechoc.com<br />
                        {t(tr.INFO_IMPRESS_PHONE)}: + 49 151 65486876<br /><br />
                        {t(tr.INFO_IMPRESS_EXECUTIVE_DIRECTORS)}: Dr. Sebastian Bode & Fabian Bormann
                    </p>
                    <h2>{t(tr.INFO_PRIVACY_POLICY)}</h2>
                    <p>{t(tr.INFO_PRIVACY_POLICY_TEXT)}</p>
                </div>
            </Dialog>
        </>
    );
}

export default Info;