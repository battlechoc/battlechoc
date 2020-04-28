
const validLanguages = ['de', 'en', 'jp'];
const languages = {
    en: {
        NOTIFICATION_CHALLENGE_TITLE: ' is challenging you',
        NOTIFICATION_CHALLENGE_BODY: 'This could be a great fight!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' finished the turn',
        NOTIFICATION_TURN_FINISHED_BODY: 'Let\'s go. It\'s your move!',
        NOTIFICATION_REMEMBER_TURN_TITLE: ' is waiting!',
        NOTIFICATION_REMEMBER_TURN_BODY: 'Do your next move!',
        NOTIFICATION_OPPONENT_SURENDERED_TITLE: ' surrendered!',
        NOTIFICATION_OPPONENT_SURENDERED_BODY: 'You\'ve won this game!',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: 'You lost a game against ',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY: 'You did not take action for more than 24 hours.',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: 'You won a game against ',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: ' did not take action for more than 24 hours.'
    },
    de: {
        NOTIFICATION_CHALLENGE_TITLE: ' fordert dich heraus',
        NOTIFICATION_CHALLENGE_BODY: 'Das könnte ein episches Match werden!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' hat den Zug beendet',
        NOTIFICATION_TURN_FINISHED_BODY: 'Weiter gehts. Du bist dran!',
        NOTIFICATION_REMEMBER_TURN_TITLE: ' wartet!',
        NOTIFICATION_REMEMBER_TURN_BODY: 'Mach deinen nächsten Zug!',
        NOTIFICATION_OPPONENT_SURENDERED_TITLE: ' hat aufgegeben!',
        NOTIFICATION_OPPONENT_SURENDERED_BODY: 'Du hast dieses Spiel gewonnen!',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: 'Du hast verloren gegen ',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY: 'Du hast seit mehr als 24 Stunden keinen Zug mehr gemacht.',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: 'Du hast gewonnen gegen ',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: ' hat seit mehr als 24 Stunden keinen Zug mehr gemacht.'
    },
    ja: {
        NOTIFICATION_CHALLENGE_TITLE: ' はあなたに挑戦しています',
        NOTIFICATION_CHALLENGE_BODY: '壮絶な試合になるかもしれない',
        NOTIFICATION_TURN_FINISHED_TITLE: ' は列車を終えました',
        NOTIFICATION_TURN_FINISHED_BODY: '行くぞ 君の番だ!',
        NOTIFICATION_REMEMBER_TURN_TITLE: ' は待っています!',
        NOTIFICATION_REMEMBER_TURN_BODY: '次の動きをしてください!',
        NOTIFICATION_OPPONENT_SURENDERED_TITLE: ' は降伏した!',
        NOTIFICATION_OPPONENT_SURENDERED_BODY: 'あなたはこのゲームに勝った!',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: '対戦相手に負けた ',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY: '24時間以上行動を起こさなかった。',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: '試合に勝ったのは ',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: ' は24時間以上行動を起こさなかった。'
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