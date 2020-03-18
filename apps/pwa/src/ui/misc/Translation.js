import * as translations from './translations';
import OfflineStore from '../../OfflineStore';
import { ServerRequest } from '../../helper/settings';
import logger from '../../helper/logger';

class Translation {
    constructor() {
        this.currentLanguage = window.location.pathname.substr(1, 2) === 'de' ? 'de' : 'en';
    }

    isValid(language) {
        return ['en', 'de', 'ja'].includes(language);
    }
}

const translation = new Translation();

function setCurrentLanguage(language) {
    if (translation.isValid(language)) {
        translation.currentLanguage = language;
        ServerRequest('post', '/user/language', { language: language })
            .catch(error => {
                if (!error instanceof ReferenceError) {
                    logger.warn(error)
                }
            })
            .finally(() => OfflineStore.settingsStore.set("language", language));
    } else {
        console.error("invalid language " + language + " given. Current language " + translation.currentLanguage + " used.");
    }
}

function getCurrentLanguage() {
    return translation.currentLanguage;
}

function translate(key) {
    if (typeof key === 'undefined') {
        console.error("invalid translation key given");
        return '';
    } else {
        const currentTranslation = translations[translation.currentLanguage];
        if (typeof currentTranslation === 'undefined') {
            console.warn("translations data for current language " + translation.currentLanguage + " undefined. this is weired.");
            return '';
        } else {
            if (typeof currentTranslation[key] === 'undefined') {
                console.warn("invalid translation key " + key + " given for current language " + translation.currentLanguage);
                return '';
            } else {
                if (typeof currentTranslation[key] === 'function') {
                    return currentTranslation[key](...([].slice.call(arguments, 1)));
                } else {
                    return currentTranslation[key];
                }
            }
        }
    }
}

export { setCurrentLanguage, getCurrentLanguage, translate };