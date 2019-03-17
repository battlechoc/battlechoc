import { EntityType } from '../gameplay/GameEntities';

const languages = {
    en: {
        NEW_GAME: 'New Game',
        RESUME_GAME: 'Resume Game',
        SETTINGS: 'Settings',
        SETTINGS_ATTENTION_TEXT: 'Attention, if you press the button above again, you give up the current game and your opponent wins',
        SETTINGS_QUIT: 'Quit Game',
        GERMAN: 'German',
        ENGLISH: 'English',
        LANGUAGE: 'Language',
        BUTTON_BACK: 'Back',
        TOOLTIP_INITIAL_TURN_TITLE: 'Initial Turn',
        TOOLTIP_INITIAL_TURN_MESSAGE: 'In the first round you can choose a playing field or the first move',
        TOOLTIP_INITIAL_TURN_OPPONENT: name => name + ' can now select a game field',
        TOOLTIP_BUILDING_INFO: (type, building) => {
            switch(type) {
                case EntityType.CREAM:
                    return {
                                info: 'Buildings built in cream will be hidden from the enemy. The building order of cream and buildings does not matter',
                                costs:'Cacao costs: ' + building.costs
                            }
                case EntityType.FACTORY_EXTENSION:
                    return {
                                info: 'A factory extension can only be placed directly next to your factory',
                                costs: 'Cacao costs: ' + building.costs,
                                advantages: 'Buildings per turn +2'
                            }
                case EntityType.CACAOTREE:
                    return {
                                info: 'The cacao tree offers you all the resources you need',
                                costs: 'Cacao costs: ' + building.costs,
                                advantages: 'Cacao per turn +30'
                            }
                case EntityType.RUM_TRUFFLE_CANNON:
                    return {
                                info: 'The rum truffle cannon leads you to victory',
                                costs: 'Cacao costs: ' + building.costs,
                                advantages: 'Attacks per turn +1'
                            }
                case EntityType.XMAS_FACTORY:
                    return {
                                info: 'The rumor that Easter bunnies are melted down to Santa Clauses is true! If an Easter bunny comes near the Christmas factory, a present is waiting for you',
                                costs: 'Cacao costs: ' + building.costs
                            }
                case EntityType.SPYING_EASTER_BUNNY:
                    return {
                                info: 'The spying easter bunny can look under the cream of the opponent, but watch out for Christmas factories',
                                costs: 'Cacao costs: ' + building.costs,
                                advantages: 'Spying per turn +1'
                            }
                default: return { info: 'Unkown building' }
            }
        },
        TOOLTIP_INITIAL_PLACEMENT_TITLE: 'Initial Placement',
        TOOLTIP_INITIAL_PLACEMENT_MESSAGE: 'Now you can build the factory once. Set the factory carefully: If it is destroyed, you cannot build any other buildings',
        TOOLTIP_BUILD_PHASE_TITLE: 'Build Phase',
        TOOLTIP_BUILD_PHASE_MESSAGE: 'Choose a building from the list below and build it on any of the free fields. The cream is displayed translucent. A building built in cream will be invisible to the enemy',
        TOOLTIP_ATTACK_PHASE_TITLE: 'Attack Phase',
        TOOLTIP_ATTACK_PHASE_MESSAGE: 'Click on an enemy building to destroy it. Hint: Smart enemies hide buildings within cream',
        MESSAGE_PLAYER_DECIDE: 'It\'s up on you',
        MESSAGE_OPPONENT_DECIDE: 'Your opponent decides',
        MESSAGE_WIN_GAME: 'Congratulations! You won this game',
        MESSAGE_LOST_GAME: 'You lost',
        MESSAGE_DRAW_GAME: 'Draw game!',
        META_DESCRIPTION: 'You like chocolate and games? Get started now and play battlechoc, a turn-based strategy game with cacao flavor. Do you prefer apps over websites when it comes to gaming? Sure: Just add battlechoc to your home screen and play it offline wherever and whenever you want!',
        META_KEYWORDS: 'Chocolate, Games, Strategy game, Board game, PWA, Cocoa, turn-based, Chocolate gun, Cocoa tree',
        REPORT_CUSTOM_MESSAGE: 'Additional Message',
        REPORT_CUSTOM_MESSAGE_PLACEHOLDER: 'The problem occurs when you ...',
        REPORT_DEVICE_INFO: 'Add device information',
        REPORT_PROBLEM: 'Report Problem',
        SNACKBAR_ERROR: 'Error sending the problem report. Check your Internet connection',
        SNACKBAR_SEND: 'The problem report was sent successfully!',
        REPORT_INFORMATION: 'The report will automatically include your turn history so we can reproduce your game and the problem. Further observations in the form of an additional message, or your device information (operating system, etc.) will help enormously. We delete this information immediately after the bug has been fixed, or the problem could not be recreated. Thanks for your help!'
    },
    de: {
        NEW_GAME: 'Neues Spiel',
        RESUME_GAME: 'Weiterspielen',
        SETTINGS: 'Einstellungen',
        SETTINGS_ATTENTION_TEXT: 'Achtung, wenn du den Button erneut betätigst, gibst du das aktuelle Spiel auf und der Gegner gewinnt',
        SETTINGS_QUIT: 'Spiel beenden',
        GERMAN: 'Deutsch',
        ENGLISH: 'Englisch',
        LANGUAGE: 'Sprache',
        BUTTON_BACK: 'Zurück',
        TOOLTIP_INITIAL_TURN_TITLE: 'Erste Runde',
        TOOLTIP_INITIAL_TURN_MESSAGE: 'In der ersten Runde kannst du dich für eines der Spielfelder, oder den ersten Zug entscheiden',
        TOOLTIP_INITIAL_TURN_OPPONENT: name => name + ' kann nun ein Spielfeld aussuchen',
        TOOLTIP_BUILDING_INFO: (type, building) => {
            switch(type) {
                case EntityType.CREAM:
                    return {
                                info: 'Gebäude die in Sahne gebaut sind bleiben dem Gegner verborgen. Die Baureihenfolge von Sahne und Gebäude sind dabei egal',
                                costs:'Kakaokosten: ' + building.costs
                            }
                case EntityType.FACTORY_EXTENSION:
                    return {
                                info: 'Eine Fabrikerweiterung kann nur direkt neben deiner Fabrik platziert werden',
                                costs: 'Kakaokosten: ' + building.costs,
                                advantages: 'Gebäude pro Runde +2'
                            }
                case EntityType.CACAOTREE:
                    return {
                                info: 'Der Kakaobaum gibt dir alles was du an Rohstoffen brauchst',
                                costs: 'Kakaokosten: ' + building.costs,
                                advantages: 'Kakao pro Runde +30'
                            }
                case EntityType.RUM_TRUFFLE_CANNON:
                    return {
                                info: 'Die Rumtrüffelkanone führt dich zum Sieg',
                                costs: 'Kakaokosten: ' + building.costs,
                                advantages: 'Angriffe pro Runde +1'
                            }
                case EntityType.XMAS_FACTORY:
                    return {
                                info: 'Das Gerücht, dass Osterhasen zu Weihnachtsmännern eingeschmolzen werden stimmt! Kommt ein Osterhase in die Nähe der Weihnachtsfabrik wartet ein Geschenk auf dich',
                                costs: 'Kakaokosten: ' + building.costs
                            }
                case EntityType.SPYING_EASTER_BUNNY:
                    return {
                                info: 'Der Spionage-Osterhase kann unter die Sahne des Gegners schauen, aber achte auf mögliche Weihnachtsfabriken',
                                costs: 'Kakaokosten: ' + building.costs,
                                advantages: 'Spionage pro Runde +1'
                            }
                default: return { info: 'Unbekanntes Gebäude' }
            }
        },
        TOOLTIP_INITIAL_PLACEMENT_TITLE: 'Erste Bauphase',
        TOOLTIP_INITIAL_PLACEMENT_MESSAGE: 'In der ersten Bauphase kannst du einmalig die Fabrik setzen. Überlege daher gut: Ist die Fabrik zerstört kannst du keine weiteren Gebäude bauen',
        TOOLTIP_BUILD_PHASE_TITLE: 'Bauphase',
        TOOLTIP_BUILD_PHASE_MESSAGE: 'Wähle ein Gebäude aus der unteren Symbolleiste aus und plaziere es. Sahne ist durchsichtig dargestellt. Ein Gebäude, dass in Sahne gebaut wird ist unsichtbar für den Gegner',
        TOOLTIP_ATTACK_PHASE_TITLE: 'Angiffsphase',
        TOOLTIP_ATTACK_PHASE_MESSAGE: 'Klicke auf ein gegnerisches Gebäude um es anzugreifen. Hinweis: Kluge Gegner verstecken ihre Gebäude unter Sahne',
        MESSAGE_PLAYER_DECIDE: 'Entscheide dich jetzt!',
        MESSAGE_OPPONENT_DECIDE: 'Dein Gegner entscheidet',
        MESSAGE_WIN_GAME: 'Glückwunsch! Du hast das Spiel gewonnen',
        MESSAGE_LOST_GAME: 'Du hast verloren',
        MESSAGE_DRAW_GAME: 'Unentschieden!',
        META_DESCRIPTION: 'Du magst Schokolade und Spiele? Lege jetzt los und spiele battlechoc ein rundenbasiertes Strategiespiel mit Kakaoflavor. Apps sind dir lieber als Websites wenn es ums spielen geht? Klar: Füge battlechoc einfach zu deinem Homescreen hinzu und spiele es offline wo und wann du willst!',
        META_KEYWORDS: 'Schokolade, Spiele, Strategiespiel, Brettspiel, PWA, Kakao, rundenbasiert, Schokoladenkanone, Kakaobaum',
        REPORT_CUSTOM_MESSAGE: 'Zusätzliche Nachricht',
        REPORT_CUSTOM_MESSAGE_PLACEHOLDER: 'Das Problem tritt auf, wenn du ...',
        REPORT_PROBLEM: 'Problembericht senden',
        REPORT_DEVICE_INFO: 'Geräteinformationen anhängen',
        SNACKBAR_ERROR: 'Fehler beim Senden des Problemberichts. Prüfe deine Internetverbindung',
        SNACKBAR_SEND: 'Der Problembericht wurde erfolgreich gesendet!',
        REPORT_INFORMATION: 'Der Bericht enthält automatisch deine Zug History, damit wir dein Spiel und damit den Fehler nachstellen können. Weitere Beobachtungen in Form einer zusätzlichen Nachricht, oder deine Geräteinformationen (Betriebssystem, etc.) helfen dabei enorm. Wir verwenden diese Informationen ausschließlich zum nachstellen und beheben des Fehlers und löschen diese im Anschluss. Danke für deine Hilfe!'
    }
};

export default languages;