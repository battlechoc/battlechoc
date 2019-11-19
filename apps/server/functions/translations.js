
const validLanguages = ['de', 'en'];
const languages = {
    en: {
        NOTIFICATION_CHALLENGE_TITLE: ' challenges you @battlechoc',
        NOTIFICATION_CHALLENGE_BODY: 'This could be a great fight!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' finished the turn @battlechoc',
        NOTIFICATION_TURN_FINISHED_BODY: 'Let\'s go. It\'s your move!'
    },
    de: {
        NOTIFICATION_CHALLENGE_TITLE: ' fordert dich auf battlechoc.com heraus',
        NOTIFICATION_CHALLENGE_BODY: 'Das könnte ein episches Match werden!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' hat seinen Zug auf battlechoc.com beendet',
        NOTIFICATION_TURN_FINISHED_BODY: 'Weiter gehts. Du bist dran!'
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