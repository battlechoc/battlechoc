import React, { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import Fab from '@material-ui/core/Fab';
import { InfoOutlined } from '@material-ui/icons';
import { Jukebox, Translation as t } from '../misc';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import de from 'javascript-time-ago/locale/de';
import BattlechocDialog from './BattlechocDialog';

const useStyles = makeStyles(theme => ({
    icon: {
        position: 'absolute',
        zIndex: 2,
        bottom: 0,
        right: 0,
        marginBottom: 5,
        marginRight: 5
    },
    text: {
        '& *': { color: '#324D5C' },
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

    if (props.language === 'de') {
        timeAgo = new TimeAgo('de-DE');
        timeSinceUpdate = timeAgo.format(date);
        timeSinceUpdate = 'Letztes Update ' + timeSinceUpdate;
    }

    return (
        <div className={classes.icon}>
            <Fab
                size="small"
                color="primary"
                onClick={() => {
                    setOpen(true);
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                }}>
                <InfoOutlined />
            </Fab>
            <BattlechocDialog
                open={open}
                close={handleClose}
                title={`battlechoc - ${version} - ${timeSinceUpdate}`}>
                <div className={classes.text}>
                    <h2>{t[props.language].INFO_IMPRESS}</h2>
                    <p>
                        battlechoc GbR<br />
                        Triftweg 5<br />
                        38550 Isenbüttel<br />
                        {t[props.language].INFO_IMPRESS_COUNTRY}<br /><br />
                        E-mail: info@battlechoc.com<br />
                        {t[props.language].INFO_IMPRESS_PHONE}: + 49 151 65486876<br /><br />
                        {t[props.language].INFO_IMPRESS_EXECUTIVE_DIRECTORS}: Dr. Sebastian Bode & Fabian Bormann
                    </p>
                    <h2>{t[props.language].INFO_PRIVACY_POLICY}</h2>
                    <p>{t[props.language].INFO_PRIVACY_POLICY_TEXT}</p>
                    <h3>Google Web Analytics</h3>
                    <p>{t[props.language].INFO_GOOGLE_ANALYTICS}</p>
                    <ul>
                        <li>{t[props.language].INFO_GOOGLE_ANALYTICS_OPERATING_SYSTEM}</li>
                        <li>{t[props.language].INFO_GOOGLE_ANALYTICS_BROWSER_TYPE}</li>
                        <li>{t[props.language].INFO_GOOGLE_ANALYTICS_REFERRER_URL}</li>
                        <li>{t[props.language].INFO_GOOGLE_ANALYTICS_HOST_NAME}</li>
                        <li>{t[props.language].INFO_GOOGLE_ANALYTICS_SERVER_REQUEST}</li>
                    </ul>
                    <p>{t[props.language].INFO_GOOGLE_ANALYTICS_PREVENT}</p>
                </div>
            </BattlechocDialog>
        </div>
    );
}

export default Info;