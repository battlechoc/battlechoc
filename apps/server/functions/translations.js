
const validLanguages = ['de', 'en'];
const languages = {
    en: {
        NOTIFICATION_CHALLENGE_TITLE: ' challenges you @battlechoc',
        NOTIFICATION_CHALLENGE_BODY: 'This could be a great fight!'
    },
    de: {
        NOTIFICATION_CHALLENGE_TITLE: ' fordert dich auf battlechoc.com heraus',
        NOTIFICATION_CHALLENGE_BODY: 'Das könnte ein episches Match werden!'
    }
}

module.exports = {
    isValidLanguage: (language) => {
        return validLanguages.includes(language);
    },
    getDefaultLanguage: () => {
        return "en";
    },
    t: languages
}