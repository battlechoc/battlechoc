import * as translations from './translations';
import OfflineStore from '../../OfflineStore';
import { ServerRequest } from '../../helper/settings';
import logger from '../../helper/logger';

class Translation {
    constructor() {
        const localCode = window.location.pathname.substr(1, 2);
        this.currentLanguage = ['en', 'de', 'jp', 'es', 'fr', 'it', 'pt'].includes(localCode) ? localCode : 'en';
    }

    isValid(language) {
        return ['en', 'de', 'jp', 'es', 'fr', 'it', 'pt'].includes(language);
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
        const currentTranslation = translations.translation[translation.currentLanguage];
        if (typeof currentTranslation === 'undefined') {
            console.warn("translations data for current language " + translation.currentLanguage + " undefined. this is weired.");
            return '';
        } else {
            if (translations.translation.isPredicate(key)) {
                return translations.translation.callPredicate(translation.currentLanguage, key, ...([].slice.call(arguments, 1)));
            } else if (typeof currentTranslation[key] === 'string') {
                return currentTranslation[key];
            } else {
                console.warn("Undefined text key in current translation: {} {}", translation.currentLanguage, key);
                return '';
            }
        }
    }
}

export { setCurrentLanguage, getCurrentLanguage, translate };