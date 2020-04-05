
const validLanguages = ['de', 'en', 'jp'];
const languages = {
    en: {
        NOTIFICATION_CHALLENGE_TITLE: ' is challenging you',
        NOTIFICATION_CHALLENGE_BODY: 'This could be a great fight!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' finished the turn',
        NOTIFICATION_TURN_FINISHED_BODY: 'Let\'s go. It\'s your move!'
    },
    de: {
        NOTIFICATION_CHALLENGE_TITLE: ' fordert dich heraus',
        NOTIFICATION_CHALLENGE_BODY: 'Das könnte ein episches Match werden!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' hat den Zug beendet',
        NOTIFICATION_TURN_FINISHED_BODY: 'Weiter gehts. Du bist dran!'
    },
    ja: {
        NOTIFICATION_CHALLENGE_TITLE: ' はあなたに挑戦しています',
        NOTIFICATION_CHALLENGE_BODY: '壮絶な試合になるかもしれない',
        NOTIFICATION_TURN_FINISHED_TITLE: ' は列車を終えました',
        NOTIFICATION_TURN_FINISHED_BODY: '行くぞ 君の番だ!'
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