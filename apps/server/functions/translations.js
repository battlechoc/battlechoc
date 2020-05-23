
const validLanguages = ['de', 'en', 'jp', 'es', 'fr', 'it', 'pt'];
const languages = {
    en: {
        NOTIFICATION_CHALLENGE_TITLE: ' is challenging you!',
        NOTIFICATION_CHALLENGE_BODY: 'This could be a great fight!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' finished the turn.',
        NOTIFICATION_TURN_FINISHED_BODY: 'Let\'s go. It\'s your turn!',
        NOTIFICATION_REMEMBER_TURN_TITLE: ' is waiting!',
        NOTIFICATION_REMEMBER_TURN_BODY: 'Make your next move!',
        NOTIFICATION_OPPONENT_SURENDERED_TITLE: ' surrendered!',
        NOTIFICATION_OPPONENT_SURENDERED_BODY: 'You\'ve won this match!',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: 'You lost a match against ',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY: 'You did not take action for more than 24 hours.',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: 'You won a match against ',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: ' did not take action for more than 24 hours.',
        NOTIFICATION_GAME_LOST_TITLE: 'You\'ve lost your match!',
        NOTIFICATION_GAME_LOST_BODY: 'You lost against '
    },
    de: {
        NOTIFICATION_CHALLENGE_TITLE: ' fordert dich heraus!',
        NOTIFICATION_CHALLENGE_BODY: 'Das könnte ein episches Match werden!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' hat den Zug beendet.',
        NOTIFICATION_TURN_FINISHED_BODY: 'Weiter gehts. Du bist dran!',
        NOTIFICATION_REMEMBER_TURN_TITLE: ' wartet!',
        NOTIFICATION_REMEMBER_TURN_BODY: 'Mach deinen nächsten Zug!',
        NOTIFICATION_OPPONENT_SURENDERED_TITLE: ' hat aufgegeben!',
        NOTIFICATION_OPPONENT_SURENDERED_BODY: 'Du hast dieses Spiel gewonnen!',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: 'Du hast verloren gegen ',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY: 'Du hast seit mehr als 24 Stunden keinen Zug mehr gemacht.',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: 'Du hast gewonnen gegen ',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: ' hat seit mehr als 24 Stunden keinen Zug mehr gemacht.',
        NOTIFICATION_GAME_LOST_TITLE: 'Du hast ein Spiel verloren!',
        NOTIFICATION_GAME_LOST_BODY: 'Du hast verloren gegen '
    },
    jp: {
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
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: ' は24時間以上行動を起こさなかった。',
        NOTIFICATION_GAME_LOST_TITLE: 'ゲームに負けました!',
        NOTIFICATION_GAME_LOST_BODY: 'に負けた '
    },
    es: {
        NOTIFICATION_CHALLENGE_TITLE: ' te está desafiando!',
        NOTIFICATION_CHALLENGE_BODY: '¡Esta podría ser una gran pelea!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' terminó el turno.',
        NOTIFICATION_TURN_FINISHED_BODY: 'Vamonos. ¡Es tu turno!',
        NOTIFICATION_REMEMBER_TURN_TITLE: ' esta esperando!',
        NOTIFICATION_REMEMBER_TURN_BODY: '¡Haz tu próximo movimiento!',
        NOTIFICATION_OPPONENT_SURENDERED_TITLE: ' se rindió',
        NOTIFICATION_OPPONENT_SURENDERED_BODY: '¡Has ganado este partido!',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: 'Perdiste un partido contra ',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY: 'No actuó durante más de 24 horas.',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: 'Ganaste un partido contra ',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: ' no tomó medidas por más de 24 horas.',
        NOTIFICATION_GAME_LOST_TITLE: '¡Has perdido tu partido!',
        NOTIFICATION_GAME_LOST_BODY: 'Perdiste contra '
    },
    fr: {
        NOTIFICATION_CHALLENGE_TITLE: ' vous défie!',
        NOTIFICATION_CHALLENGE_BODY: 'Cela pourrait être un grand combat!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' a terminé le tour.',
        NOTIFICATION_TURN_FINISHED_BODY: 'Allons-y. C\'est ton tour!',
        NOTIFICATION_REMEMBER_TURN_TITLE: ' attend!',
        NOTIFICATION_REMEMBER_TURN_BODY: 'Faites votre prochain pas!',
        NOTIFICATION_OPPONENT_SURENDERED_TITLE: ' s\'est rendue!',
        NOTIFICATION_OPPONENT_SURENDERED_BODY: 'Vous avez gagné ce match!',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: 'Vous avez perdu un match contre ',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY: 'Vous n\'avez pris aucune mesure pendant plus de 24 heures.',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: 'Tu as gagné un match contre ',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: ' n\'a pris aucune mesure pendant plus de 24 heures.',
        NOTIFICATION_GAME_LOST_TITLE: 'Vous avez perdu votre match!',
        NOTIFICATION_GAME_LOST_BODY: 'Tu as perdu contre '
    },
    it: {
        NOTIFICATION_CHALLENGE_TITLE: ' ti sta sfidando!',
        NOTIFICATION_CHALLENGE_BODY: 'Questa potrebbe essere una grande lotta!',
        NOTIFICATION_TURN_FINISHED_TITLE: '  ha finito il turno.',
        NOTIFICATION_TURN_FINISHED_BODY: 'Andiamo! È il tuo turno!',
        NOTIFICATION_REMEMBER_TURN_TITLE: ' sta aspettando!',
        NOTIFICATION_REMEMBER_TURN_BODY: 'Fai la tua prossima mossa!',
        NOTIFICATION_OPPONENT_SURENDERED_TITLE: ' si arrese!',
        NOTIFICATION_OPPONENT_SURENDERED_BODY: 'Hai vinto questa partita!',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: 'Hai perso una partita contro ',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY: 'Non hai agito per più di 24 ore.',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: 'Hai vinto una partita contro ',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: ' non ha agito per più di 24 ore.',
        NOTIFICATION_GAME_LOST_TITLE: 'Hai perso la partita!',
        NOTIFICATION_GAME_LOST_BODY: 'Hai perso contro '
    },
    pt: {
        NOTIFICATION_CHALLENGE_TITLE: ' está desafiando você!',
        NOTIFICATION_CHALLENGE_BODY: 'Esta poderia ser uma grande luta!',
        NOTIFICATION_TURN_FINISHED_TITLE: ' terminou a curva.',
        NOTIFICATION_TURN_FINISHED_BODY: 'Vamos lá. É sua vez!',
        NOTIFICATION_REMEMBER_TURN_TITLE: ' está esperando!',
        NOTIFICATION_REMEMBER_TURN_BODY: 'Faça a sua próxima jogada!',
        NOTIFICATION_OPPONENT_SURENDERED_TITLE: ' se rendeu!',
        NOTIFICATION_OPPONENT_SURENDERED_BODY: 'Você venceu esta partida!',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_TITLE: 'Você perdeu uma partida contra ',
        NOTIFICATION_SESSION_TIMEDOUT_LOOSER_BODY: 'Você não agiu por mais de 24 horas.',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_TITLE: 'Você venceu uma partida contra ',
        NOTIFICATION_SESSION_TIMEDOUT_WINNER_BODY: ' não agiu por mais de 24 horas.',
        NOTIFICATION_GAME_LOST_TITLE: 'Você perdeu a partida!',
        NOTIFICATION_GAME_LOST_BODY: 'Você perdeu contra o '
    }
}

module.exports = {
    isValidLanguage: (language) => {
        return validLanguages.includes(language);
    },
    getDefaultLanguage: () => {
        return 'en';
    },
    t: languages
}