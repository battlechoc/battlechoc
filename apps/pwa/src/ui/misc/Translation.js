import { EntityType, AttackType } from '../../gameplay/GameEntities';

const languages = {
    en: {
        SIGNINORUP: 'Sign in',
        NEW_GAME: 'New Game',
        SIGN_OUT: 'Sign out',
        ACCOUNTINFOS: 'Account infos',
        ACCOUNTINFOS_PREVIEW: 'Coming soon, infos about your account and player stats.',
        ACCOUNT_OVERVIEW_ASSOCIATION: 'Your Account is associated with',
        SETTINGS: 'Settings',
        SETTINGS_ATTENTION_TEXT: 'Attention, if you press the button above again, you give up the current game and your opponent wins',
        ACCOUNT_OVERVIEW_CREATE_INFO: 'To share your account across devices and restore your progress in battlechoc if your device is lost, it is possible to connect it to one of these options.',
        ACCOUNT_OVERVIEW_LEVEL: 'Level',
        ACCOUNT_OVERVIEW_RANK: 'Rank',
        ACCOUNT_OVERVIEW_WON: 'Won',
        ACCOUNT_OVERVIEW_DRAWN: 'Drawn',
        ACCOUNT_OVERVIEW_LOST: 'Lost',
        ACCOUNT_OVERVIEW_COINS: 'Coins',
        SETTINGS_QUIT: 'Quit Game',
        SETTINGS_PLAYER_NAME_IN_USE: 'username already in use',
        SETTINGS_PLAYER_NAME_INVALID: 'username not valid (3-15 chars or digits, first sign should be a char)',
        HUD_RESUME_GAME: 'Resume Game',
        HUD_ASK_NEW_OR_RESUME: 'Do you want to start a new game or resume your last one?',
        HUD_NEW_GAME: 'New game',
        GAME_END_OVERVIEW_ATTACKS: 'Attacks',
        GAME_END_OVERVIEW_ENTITIES: 'Entities Overall',
        GAME_END_OVERVIEW_ESPIONAGES: 'Espionages',
        GAME_END_OVERVIEW_MOLTEN_FIELDS: 'Molten fields',
        GERMAN: 'German',
        ENGLISH: 'English',
        LANGUAGE: 'Language',
        BUTTON_BACK: 'Back',
        INVITATION: 'Join my battlechoc multiplayer game!',
        TOOLTIP_INITIAL_TURN_TITLE: 'Initial Turn',
        TOOLTIP_INITIAL_TURN_MESSAGE: 'In the first round you can choose a playing field or the first move',
        TOOLTIP_INITIAL_TURN_OPPONENT: name => name + ' can now select a game field',
        TOOLTIP_BUILDING_TITLE: (type) => {
            switch (type) {
                case EntityType.CREAM: return 'Cream';
                case EntityType.FACTORY_EXTENSION: return 'Factory extension';
                case EntityType.FACTORY: return 'Chocolate Factory';
                case EntityType.HOT_CHOCOLATE_BALLISTA: return 'Hot chocolate ballista';
                case EntityType.CACAOTREE: return 'Cacao tree';
                case EntityType.RUM_TRUFFLE_CANNON: return 'Rum truffle cannon';
                case EntityType.XMAS_FACTORY: return 'X-mas factory';
                case EntityType.SPYING_EASTER_BUNNY: return 'Spying easter bunny';
                case EntityType.CHOCOLATE_FOUNTAIN: return 'Chocolate fountain';
                case EntityType.FRUIT_CANNON: return 'Fruit cannon';
                default: return 'Unkown';
            }
        },
        TOOLTIP_BUILDING_INFO: (type, building) => {
            switch (type) {
                case EntityType.CREAM:
                    return {
                        info: 'Buildings built in cream will be hidden from the enemy. The building order of cream and buildings does not matter',
                        costs: 'Cacao costs: ' + building.costs
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
                case EntityType.CHOCOLATE_FOUNTAIN:
                    return {
                        info: 'The chocolate fountain safes all surrounding buildings from rum truffle cannon attacks.',
                        costs: 'Cacao costs: ' + building.costs,
                        advantages: 'Secures an area of 3x3 cells around the fountain.'
                    }
                case EntityType.FRUIT_CANNON:
                    return {
                        info: 'The fruit cannon destroys creams and chocolate fountains of your enemy.',
                        costs: 'Cacao costs: ' + building.costs,
                        advantages: 'Fruit attacks per turn +1'
                    }
                default: return { info: 'Unkown building' }
            }
        },
        TOOLTIP_INITIAL_PLACEMENT_TITLE: 'Initial Placement',
        TOOLTIP_INITIAL_PLACEMENT_MESSAGE: 'Now you can build the factory once. Set the factory carefully: If it is destroyed, you cannot build any other buildings',
        TOOLTIP_BUILD_PHASE_TITLE: 'Build Phase',
        TOOLTIP_BUILD_PHASE_MESSAGE: 'Choose a building from the list below and build it on any of the free fields. The cream is displayed translucent. A building built in cream will be invisible to the enemy',
        TOOLTIP_ATTACK_PHASE_TITLE: 'Attack Phase',
        TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE: (attackType) => {
            switch (attackType) {
                case AttackType.TRUFFLE: return 'Rum truffle';
                case AttackType.FRUIT: return 'Fruit';
                case AttackType.HOT_CHOCOLATE: return 'Hot chocolate';
                case AttackType.BUNNY: return 'Spying easter bunny';
                default: return 'Unkown';
            }
        },
        TOOLTIP_ATTACK_PHASE_MESSAGE: 'Click on an enemy building to destroy it. Hint: Smart enemies hide buildings within cream',
        TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE: (attackType) => {
            switch (attackType) {
                case AttackType.TRUFFLE: return 'Destroys buildings and cream. Can be mitigated by the chocolate fountain shield.';
                case AttackType.FRUIT: return 'Destroys creams and the chocolate fountain. Other buildings are not harmed by the fruit cannon.';
                case AttackType.HOT_CHOCOLATE: return 'Destroys buildings, creams and even the part of the gamefield that is attacked. Cannot be mitigated by the chocolate fountain shield.';
                case AttackType.BUNNY: return 'Reveals all the buildings under creams within a 3x3 region around the attacked cell. Gets caught by X-mas factories in the vincinity.';
                default: return 'Unkown';
            }
        },
        MESSAGE_WIN_GAME: 'Congratulations! You won this game',
        MESSAGE_LOST_GAME: 'You lost',
        MESSAGE_DRAW_GAME: 'Draw game!',
        META_DESCRIPTION: 'You like chocolate and games? Get started now and play battlechoc, a turn-based strategy game with cacao flavor. Do you prefer apps over websites when it comes to gaming? Sure: Just add battlechoc to your home screen and play it offline wherever and whenever you want!',
        META_KEYWORDS: 'Chocolate, Games, Strategy game, Board game, PWA, Cocoa, turn-based, Chocolate gun, Cocoa tree',
        REPORT_CUSTOM_MESSAGE: 'Additional Message',
        REPORT_CUSTOM_MESSAGE_PLACEHOLDER: 'The problem occurs after ...',
        REPORT_DEVICE_INFO: 'Add device information',
        REPORT_PROBLEM: 'Report Problem',
        RESTART_TUTORIAL: 'Restart Tutorial',
        ERROR_SENDING_PROBLEM_REPORT: 'Error sending the problem report. Check your Internet connection',
        SUCCESSFULLY_SENDING_PROBLEM_REPORT: 'Problem report was sent successfully!',
        REPORT_INFORMATION: 'The report will automatically include your turn history so we can reproduce your game and the problem. Further observations in the form of an additional message, or your device information (operating system, etc.) will help enormously. We delete this information immediately after the bug has been fixed, or the problem could not be recreated. Thanks for your help!',
        INFO_IMPRESS: 'Impress',
        INFO_IMPRESS_COUNTRY: 'Germany',
        INFO_IMPRESS_PHONE: 'Phone',
        INFO_IMPRESS_EXECUTIVE_DIRECTORS: 'Executive Directors',
        INFO_PRIVACY_POLICY: 'Privacy policy',
        INFO_PRIVACY_POLICY_TEXT: 'Currently we do not earn any money with battlechoc and it is free playable for everyone. We try to protect your data at all times, which is why we only collect data in two ways. First, we collect data if you manually submit a bug report. This is where we store your game state and your move history. By activating a checkbox you can also tell us your browser information and your operating system. In order to be able to reproduce the error, an additional message often helps as well, which we also save when you specify it. After we have been able to reproduce and resolve the bug, we will immediately delete this information, but at the latest after 2 months after sending the error report. The second way we collect data is through the use of Google Web Analytics. We would like to explain this in more detail in the paragraph below.',
        INFO_GOOGLE_ANALYTICS: 'In order to adapt and continuously optimize battlechoc, we use Google Web Analytics, a web analysis service of Google Inc. (1600 Amphitheater Parkway, Mountain View, CA 94043, USA, hereinafter referred as "Google"). In this context, pseudonymised user profiles are created and cookies are used.Cookies are small text files for temporary storage of information which are automatically stored on your device by your browser. Cookies do not contain viruses and are not dangerous.The information generated by the cookie about your use of this website, such as',
        INFO_GOOGLE_ANALYTICS_OPERATING_SYSTEM: 'operating system',
        INFO_GOOGLE_ANALYTICS_BROWSER_TYPE: 'browser type / version',
        INFO_GOOGLE_ANALYTICS_REFERRER_URL: 'Referrer URL (the previously visited page)',
        INFO_GOOGLE_ANALYTICS_HOST_NAME: 'host name of the accessing computer (IP address)',
        INFO_GOOGLE_ANALYTICS_SERVER_REQUEST: 'time of server request',
        INFO_GOOGLE_ANALYTICS_PREVENT: 'are transferred to a Google server in the USA and stored there. The information is used to evaluate the use of the website, to generate reports on website activity for market, UI/UX research. This information may also be disclosed to third parties where required to do so by law or where such third parties process the information on behalf of the Company. Under no circumstances will your IP address be merged with other data held by Google. The IP addresses are anonymised so that no mapping is possible (IP masking). You may refuse the use of cookies by selecting the appropriate settings on your browser. It is also possible to prevent the collection of data generated by the cookie and related to your use of our website (including your IP address) and the processing of this data by Google by downloading and installing a browser add-on (https: // tools.google.com/dlpage/gaoptout?hl=en). As an alternative to the browser add-on, especially for browsers on mobile devices, you can prevent Google Analytics from collecting data by clicking on this link. An opt-out cookie is set to prevent your data from being collected in the future when you visit this website. The opt-out cookie is only valid in this browser and only for our website and is stored on your device. If you delete the cookies in this browser, you will need to set the opt-out cookie again. You can find further information on data protection in connection with Google Analytics in the Google Analytics help (https://policies.google.com/?hl=en). The service provider is part of the EU-US Privacy Agreement.',
        TUTORIAL: 'Tutorial',
        IOS_MESSAGE: 'To play battlechoc in fullscreen mode on iOS you need to rotate your iPhone [0] or use the share icon [1] and select [2] "Add to Home Screen"',
        JOIN_MULTIPLAYER: 'Join Multiplayer Game',
        TUTORIAL_CHOOSE_MESSAGE_1: 'Welcome to battlechoc! It seems that you are playing for the first time',
        TUTORIAL_CHOOSE_MESSAGE_2: 'You can skip a tutorial page by clicking this icon above',
        TUTORIAL_CHOOSE_MESSAGE_3: 'To continue with this tutorial choose between first turn or one of the game fields',
        TUTORIAL_FACTORY_MESSAGE_1: 'To build e.g. cacao trees or rum truffle cannons, you need to build a chocolate factory',
        TUTORIAL_FACTORY_MESSAGE_2: 'The factory allows you to build 2 buildings per turn',
        TUTORIAL_FACTORY_MESSAGE_3: 'Hint: If you build a factory on black chocolate, it works better and is able to produce up to 3 buildings per turn',
        TUTORIAL_FACTORY_MESSAGE_4: 'Tap on one of the fields to place the factory and continue with the tutorial',
        TUTORIAL_TREES_MESSAGE_1: 'The most important buildings are the cacao tree and the rum truffle cannon',
        TUTORIAL_TREES_MESSAGE_2: 'You win a game if you destroy the factory and all of your opponents cannons',
        TUTORIAL_TREES_MESSAGE_3: 'Plant a few trees to get cacao. You\'re gonna need it to build a cannon',
        TUTORIAL_TREES_MESSAGE_4: 'Build a cannon and attack your opponent\'s factory to continue the tutorial',
        TUTORIAL_TREES_MESSAGE_5: 'Hint: If you build a cacao tree on a white field it grows better produces 1.5x more cacao per round',
        TUTORIAL_TREES_MESSAGE_6: 'battlechoc is a turn-based strategy game. A turn consists of two game phases: Build and attack',
        TUTORIAL_TREES_MESSAGE_7: 'The game notices when no other action can be performed and guides you to the next phase or turn',
        TUTORIAL_TREES_MESSAGE_8: 'If you want to end a phase earlier you can use the play or fast forward button above',
        TUTORIAL_TREES_MESSAGE_9: 'look: you gained some cacao! Now you can build a cannon. Select the cannon by tapping the icon',
        TUTORIAL_TREES_MESSAGE_10: 'Now you are able to attack your opponent. Just finish your build phase and tap on your opponent\'s facotry!',
        TUTORIAL_BUNNY_MESSAGE_1: 'The opponent\'s gamefield is filled with cream. Would you like to bring some light into the darkness?',
        TUTORIAL_BUNNY_MESSAGE_2: 'Use the spying easter bunny to uncover  all the cream on your oppoent\'s gamefield',
        TUTORIAL_BUNNY_MESSAGE_3: 'The bunny is going to uncover the area around the selected field',
        TUTORIAL_BUNNY_MESSAGE_4: 'Oh no! Your opponent also has a spying easter bunny ...',
        TUTORIAL_BUNNY_MESSAGE_5: 'You got some cacao. Now you are ready to build a X-mas factory. It will protect you from spying attacks',
        TUTORIAL_BUNNY_MESSAGE_6: 'If the bunny is going to spy an area that conatins a X-mas factory..',
        TUTORIAL_BUNNY_MESSAGE_7: 'It gets melted down and you receive a hot chocolate ballista!',
        TUTORIAL_BUNNY_MESSAGE_8: 'Now it\'s your opponent\'s turn. This animation ..',
        TUTORIAL_BUNNY_MESSAGE_9: '.. indicates that your opponent is thinking',
        TUTORIAL_FOUNTAIN_MESSAGE_1: 'Build a cacao tree and then attack your opponent\'s factory',
        TUTORIAL_FOUNTAIN_MESSAGE_2: 'Destroy your opponents Factory to finish this tutorial',
        TUTORIAL_FOUNTAIN_MESSAGE_3: 'Oh no, your opponent has a cacao shield',
        TUTORIAL_FOUNTAIN_MESSAGE_4: 'Truffles can\'t pass the shield',
        TUTORIAL_FOUNTAIN_MESSAGE_5: 'Collect enough cocoa to build a fruit cannon',
        TUTORIAL_FOUNTAIN_MESSAGE_6: 'Great! Now you can upgrade your cannons with a fruit extension',
        TUTORIAL_FOUNTAIN_MESSAGE_7: 'While fruits can pass the shield, they can only destroy the chocolate fountain and cream',
        TUTORIAL_FOUNTAIN_MESSAGE_8: 'Once the chocolate fountain is destroyed you can attack the factory with truffles',        
        TUTORIAL_TITLE_1: 'Interactive battlechoc Tutorial',
        TUTORIAL_TITLE_2: 'The chocolate factory',
        TUTORIAL_TITLE_3: 'About trees and cannons',
        TUTORIAL_TITLE_4: 'X-mas and bunnies',
        TUTORIAL_TITLE_5: 'About fruits and chocolate fountains',
        TUTORIAL_DIALOG_TITLE_BEFORE: 'You\'re almost there',
        TUTORIAL_DIALOG_TITLE: 'You did it!',
        TUTORIAL_DIALOG_MESSAGE: 'Now you are ready to play a real battlechoc match. Do you want to start right now?',
        TUTORIAL_DIALOG_HINT: 'You are now able to restart the tutorial in the settings menu',
        TUTORIAL_DIALOG_BACK: 'Back to menu',
        TUTORIAL_DIALOG_PLAY_GAME: 'Start a match',
        TUTORIAL_CHOOSE_NAME_INFO: 'Before we start it would be a good idea to choose a cool name! Friends could easily find you based on your name and foes will eventually shiver when they hear that name.',
        ACTIONS: 'Actions',
        OPPONENT: 'Opponent',
        TURNS: 'Turns',
        MATCH_TIME: 'Match Time',
        LAST_ACTION: 'Last Action',
        POTENTIAL_COINS: 'Potential Coins',
        RANDOM_OPPONENT: 'Random Opponent',
        SHARE_LINK: 'Share your Link',
        FRIENDS: 'Friends',
        START_GAME: 'Start Game',
        JOIN_GAME: 'Join Game',
        FRIENDS_INFO: 'You don\'t have any friends right now',
        ADD_FRIEND: 'Add to Friends',
        REMOVE_FRIEND: 'Remove from Friends',
        SEARCH_PLAYERS: 'Search player',
        SEARCH_USER_INFO: 'No player found',
        CHOCLAB_INCREASED_BY: 'increased by',
        ATTRIBUTE_NAME: attribute => {
            switch (attribute) {
                case 'hp': return 'Hp';
                case 'area': return 'Area Effect';
                case 'buildingsPerTurn': return 'Buildings per turn';
                case 'cacaoPerTurn': return 'Cacao per turn';
                case 'attack': return 'Attack';
                case 'fortune': return 'Fortune';
                default: return 'Unknown';
            }
        },
        WARNING_GAME_NOT_JOINABLE: 'The game you want to join has already ended',
        WARNING_PLAYER_NOT_FOUND: name => 'Player ' + name + ' not found',
        SURRENDER: 'Surrender',
        SURRENDER_GAME: 'Surrender Game',
        SURRENDER_GAME_TEXT: name => 'Do you really want to surrender the game against ' + name,
        PWA_UPDATE_AVAILABLE: 'A new version is available and will be used as soon as you restart the pwa, or the browser',
        PWA_OFFLINE_MODE: 'You are running battlechoc without internet connection, so only the singleplayer mode is available',
        PWA_ONLINE_MODE: 'You\'re re-connected to the Internet',
        UPDATE_LEVEL_FAILED: upgrade => 'It was not possible to perform the ' + (upgrade ? 'up' : 'down') + 'grade. Check your internet connection',
        NO_HEALTHY_INTERNET: 'You may not have a healthy internet connection. Please try again later',
        SESSION_REFRESH_FAILED: 'Multiplayer session refresh failed. Please check your internet connection',
        FETCH_HIGHSCORE_FAILED: 'Failed to fetch highscore. Please check your internet connection'
    },
    de: {
        SIGNINORUP: 'Anmelden',
        NEW_GAME: 'Neues Spiel',
        SIGN_OUT: 'Abmelden',
        ACCOUNTINFOS: 'Account Informationen',
        ACCOUNTINFOS_PREVIEW: 'Hier findest du bald Infos über deinen Account und Spieler-Statistiken.',
        ACCOUNT_OVERVIEW_ASSOCIATION: 'Dein Account ist verbunden mit',
        ACCOUNT_OVERVIEW_CREATE_INFO: 'Um auf deinen Account von mehreren Geräten aus zugriefen zu können oder um deinen Spielfortschritt wieder herstellen zu können, wenn eines deiner Geräte verloren geht, ist es möglich ihn an eine dieser Optionen zu binden.',
        ACCOUNT_OVERVIEW_LEVEL: 'Level',
        ACCOUNT_OVERVIEW_RANK: 'Rang',
        ACCOUNT_OVERVIEW_WON: 'Siege',
        ACCOUNT_OVERVIEW_DRAWN: 'Beide',
        ACCOUNT_OVERVIEW_LOST: 'Verloren',
        ACCOUNT_OVERVIEW_COINS: 'Münzen',
        SETTINGS: 'Einstellungen',
        SETTINGS_ATTENTION_TEXT: 'Achtung, wenn du den Button erneut betätigst, gibst du das aktuelle Spiel auf und der Gegner gewinnt',
        SETTINGS_QUIT: 'Spiel beenden',
        SETTINGS_PLAYER_NAME_IN_USE: 'Spielername bereits vergeben',
        SETTINGS_PLAYER_NAME_INVALID: 'Spielername ungültig (3-15 Buchstaben oder Zahlen, das erste Zeichen muss ein Buchstabe sein)',
        HUD_RESUME_GAME: 'Weiter spielen',
        HUD_ASK_NEW_OR_RESUME: 'Möchtest du ein neues Spiel starten oder das letzte Spiel fortsetzen?',
        HUD_NEW_GAME: 'Neues Spiel',
        GAME_END_OVERVIEW_ATTACKS: 'Angriffe',
        GAME_END_OVERVIEW_ENTITIES: 'Einheiten insgesamt',
        GAME_END_OVERVIEW_ESPIONAGES: 'Spionagen',
        GAME_END_OVERVIEW_MOLTEN_FIELDS: 'Geschmolzene Felder',
        GERMAN: 'Deutsch',
        ENGLISH: 'Englisch',
        LANGUAGE: 'Sprache',
        BUTTON_BACK: 'Zurück',
        INVITATION: 'Spiel mit mir battlechoc!',
        TOOLTIP_INITIAL_TURN_TITLE: 'Erste Runde',
        TOOLTIP_INITIAL_TURN_MESSAGE: 'In der ersten Runde kannst du dich für eines der Spielfelder, oder den ersten Zug entscheiden',
        TOOLTIP_INITIAL_TURN_OPPONENT: name => name + ' kann nun ein Spielfeld aussuchen',
        TOOLTIP_BUILDING_TITLE: (type) => {
            switch (type) {
                case EntityType.CREAM: return 'Sahne';
                case EntityType.FACTORY: return 'Schokoladenfabrik';
                case EntityType.HOT_CHOCOLATE_BALLISTA: return 'Heiße Schokoladenschleuder';
                case EntityType.FACTORY_EXTENSION: return 'Fabrikerweiterung';
                case EntityType.CACAOTREE: return 'Kakaobaum';
                case EntityType.RUM_TRUFFLE_CANNON: return 'Rumkugel-Kanone';
                case EntityType.XMAS_FACTORY: return 'Weihnachtsfabrik';
                case EntityType.SPYING_EASTER_BUNNY: return 'Osterhase';
                case EntityType.CHOCOLATE_FOUNTAIN: return 'Schokoladenbrunnen';
                case EntityType.FRUIT_CANNON: return 'Fruchtkanone';
                default: return 'Unbekannt';
            }
        },
        TOOLTIP_BUILDING_INFO: (type, building) => {
            switch (type) {
                case EntityType.CREAM:
                    return {
                        info: 'Gebäude die in Sahne gebaut sind bleiben dem Gegner verborgen. Die Baureihenfolge von Sahne und Gebäude sind dabei egal',
                        costs: 'Kakaokosten: ' + building.costs
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
                case EntityType.CHOCOLATE_FOUNTAIN:
                    return {
                        info: 'Der Schololadenbrunnen schützt in einem Bereich von 3x3 Feldern um ihn herum alle anderen Gebäude gegen gegnerischen Beschuss und kann nur durch die Hot Chocolate Ballista oder eine Fruchtkanone zerstört werden.',
                        costs: 'Kakaokosten: ' + building.costs,
                        advantages: 'Schützt einen 3x3 großen Bereich'
                    }
                case EntityType.FRUIT_CANNON:
                    return {
                        info: 'Die Fruchtkanone zerstört nur Sahnehäubchen oder gegnerische Schokoladenbrunnen.',
                        costs: 'Kakaokosten: ' + building.costs,
                        advantages: 'Fruchtangriffe pro Runde +1'
                    }
                default: return { info: 'Unbekanntes Gebäude' }
            }
        },
        TOOLTIP_INITIAL_PLACEMENT_TITLE: 'Erste Bauphase',
        TOOLTIP_INITIAL_PLACEMENT_MESSAGE: 'In der ersten Bauphase kannst du einmalig die Fabrik setzen. Überlege daher gut: Ist die Fabrik zerstört kannst du keine weiteren Gebäude bauen',
        TOOLTIP_BUILD_PHASE_TITLE: 'Bauphase',
        TOOLTIP_BUILD_PHASE_MESSAGE: 'Wähle ein Gebäude aus der unteren Symbolleiste aus und plaziere es. Sahne ist durchsichtig dargestellt. Ein Gebäude, dass in Sahne gebaut wird ist unsichtbar für den Gegner',
        TOOLTIP_ATTACK_PHASE_TITLE: 'Angiffsphase',
        TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE: (attackType) => {
            switch (attackType) {
                case AttackType.TRUFFLE: return 'Rumkugel';
                case AttackType.FRUIT: return 'Frucht';
                case AttackType.HOT_CHOCOLATE: return 'Heiße Schokolade';
                case AttackType.BUNNY: return 'Spionage-Osterhase';
                default: return 'Unbekannt';
            }
        },
        TOOLTIP_ATTACK_PHASE_MESSAGE: 'Klicke auf ein gegnerisches Gebäude um es anzugreifen. Hinweis: Kluge Gegner verstecken ihre Gebäude unter Sahne',
        TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE: (attackType) => {
            switch (attackType) {
                case AttackType.TRUFFLE: return 'Zerstört Gebäude und Sahne. Kann durch den Schild des Schokobrunnens abgewehrt werden.';
                case AttackType.FRUIT: return 'Zerstört Sahne und Schokobrunnen. Andere Gebäude werden durch die Fruchtkanone nicht gefährdet.';
                case AttackType.HOT_CHOCOLATE: return 'Zerstört Gebäude, Sahne und sogar das Spielfeld an der Stelle des Angriffs. Kann nicht durch den Schokobrunnenschild abgewehrt werden.';
                case AttackType.BUNNY: return 'Deckt alle Felder mit Sahne im 3x3 Umfeld des Angriffs auf. Wird von der Weihnachtsfabrik eingefangen, wenn sie in der Nähe des Angriffs ist.';
                default: return 'Klicke auf ein gegnerisches Gebäude um es anzugreifen. Hinweis: Kluge Gegner verstecken ihre Gebäude unter Sahne';
            }
        },
        MESSAGE_WIN_GAME: 'Glückwunsch! Du hast das Spiel gewonnen',
        MESSAGE_LOST_GAME: 'Du hast verloren',
        MESSAGE_DRAW_GAME: 'Unentschieden!',
        META_DESCRIPTION: 'Du magst Schokolade und Spiele? Lege jetzt los und spiele battlechoc ein rundenbasiertes Strategiespiel mit Kakaoflavor. Apps sind dir lieber als Websites wenn es ums spielen geht? Klar: Füge battlechoc einfach zu deinem Homescreen hinzu und spiele es offline wo und wann du willst!',
        META_KEYWORDS: 'Schokolade, Spiele, Strategiespiel, Brettspiel, PWA, Kakao, rundenbasiert, Schokoladenkanone, Kakaobaum',
        REPORT_CUSTOM_MESSAGE: 'Zusätzliche Nachricht',
        REPORT_CUSTOM_MESSAGE_PLACEHOLDER: 'Das Problem tritt auf, wenn ...',
        REPORT_PROBLEM: 'Problembericht senden',
        RESTART_TUTORIAL: 'Tutorial wiederholen',
        REPORT_DEVICE_INFO: 'Geräteinformationen anhängen',
        ERROR_SENDING_PROBLEM_REPORT: 'Fehler beim Senden des Problemberichts. Prüfe deine Internetverbindung',
        SUCCESSFULLY_SENDING_PROBLEM_REPORT: 'Dein Problembericht wurde erfolgreich verschickt!',
        REPORT_INFORMATION: 'Der Bericht enthält automatisch deine Zug History, damit wir dein Spiel und damit den Fehler nachstellen können. Weitere Beobachtungen in Form einer zusätzlichen Nachricht, oder deine Geräteinformationen (Betriebssystem, etc.) helfen dabei enorm. Wir verwenden diese Informationen ausschließlich zum nachstellen und beheben des Fehlers und löschen diese im Anschluss. Danke für deine Hilfe!',
        INFO_IMPRESS: 'Impressum',
        INFO_IMPRESS_COUNTRY: 'Deutschland',
        INFO_IMPRESS_PHONE: 'Telefon',
        INFO_IMPRESS_EXECUTIVE_DIRECTORS: 'Geschäftsführung',
        INFO_PRIVACY_POLICY: 'Datenschutzerklärung',
        INFO_PRIVACY_POLICY_TEXT: 'Derzeit verdienen wir kein Geld mit battlechoc und es ist für jeden frei spielbar. Wir sind stets bemüht, eure Daten zu schützen. Deshalb erheben wir allgemein nur so wenig Daten wie möglich. Zum einen speichern wir Fehlerberichte, die du uns aktiv über die Einstellungen sendest. Hier sichern wir deinen Spielstand und deinen Zugverlauf, damit wir dein Problem nachstellen können. Durch aktives Bestätigen einer Checkbox kannst du uns auch zusätzlich Browserinformationen und dein Betriebssystem mitteilen. Um den Fehler nachvollziehen zu können, hilft oft auch eine zusätzliche Nachricht, die wir bei Angabe ebenfalls speichern. Nachdem wir den Fehler reproduzieren und beheben konnten, werden wir all diese Informationen unverzüglich löschen, spätestens jedoch nach 2 Monaten nach Absenden des Fehlerberichts. Der zweite Weg, durch den wir Daten erheben, ist die Verwendung von Google Web Analytics. Wir möchten dies im folgenden Abschnitt näher erläutern.',
        INFO_GOOGLE_ANALYTICS: 'Zur Anpassung und kontinuierlichen Optimierung von battlechoc verwenden wir Google Web Analytics, einen Webanalysedienst von Google Inc. (1600 Amphitheater Parkway, Mountain View, CA 94043, USA, im Folgenden "Google" genannt). In diesem Zusammenhang werden pseudonymisierte Nutzerprofile erstellt und Cookies verwendet. Cookies sind kleine Textdateien zur temporären Speicherung von Informationen, die von deinem Browser automatisch auf deinem Gerät gespeichert werden. Cookies enthalten keine Viren und sind nicht gefährlich. Das Cookie enthält beispielsweise folgende Informationen über deine Nutzung von battlechoc:',
        INFO_GOOGLE_ANALYTICS_OPERATING_SYSTEM: 'Betriebssystem',
        INFO_GOOGLE_ANALYTICS_BROWSER_TYPE: 'Browsername / Version',
        INFO_GOOGLE_ANALYTICS_REFERRER_URL: 'Die vorherige Seite, die dich auf battlechoc verlinkt hat',
        INFO_GOOGLE_ANALYTICS_HOST_NAME: 'Dein host name, sowie die verwendete IP Adresse',
        INFO_GOOGLE_ANALYTICS_SERVER_REQUEST: 'Dauer des Server-Requests',
        INFO_GOOGLE_ANALYTICS_PREVENT: 'Diese Daten werden ebenfalls auf einen Google-Server in den USA übertragen und dort gespeichert. Die Informationen werden verwendet, um die Nutzung der Website zu bewerten, um Berichte über die Aktivitäten der Website für den Markt und unsere UI/UX-Forschung zu erstellen. Diese Informationen können auch an Dritte weitergegeben werden, wenn dies gesetzlich vorgeschrieben ist. In keinem Fall wird jedoch deine IP-Adresse mit anderen Daten von Google zusammengeführt. Die IP-Adressen sind anonymisiert, so dass kein Mapping auf dich persönlich möglich ist (IP-Masking). Du kannst die Verwendung von Cookies ablehnen, indem du die entsprechenden Einstellungen in deinem Browser vornimmst. Es ist auch möglich durch die Verwendung eins Browser-Add-ons (https://tools.google.com/dlpage/gaoptout?hl=de), die Erhebung von Daten, durch deine Nutzung von battlechoc, zu verhindern (einschließlich deiner IP-Adresse und die Verarbeitung dieser Daten durch Google). Als Alternative zum Browser-Add-on, insbesondere für Browser auf mobilen Geräten, kannst du verhindern, dass Google Analytics Daten sammelt, indem du auf den obigen Link klickst: Ein Opt-out Cookie wird gesetzt, um zu verhindern, dass deine Daten in Zukunft beim Besuch von battlechoc erfasst werden. Das Opt-out-Cookie ist nur in diesem Browser und nur für unsere Website gültig und wird auf deinem Gerät gespeichert. Wenn du die Cookies in diesem Browser löscht, musst du das Opt-out-Cookie erneut setzen. Weitere Informationen zum Thema Datenschutz im Zusammenhang mit Google Analytics findest du im Abschnitt Hilfe zu Google Analytics (https://policies.google.com/?hl=de). Der Dienstleister ist Teil des EU-US-Datenschutzabkommens.',
        TUTORIAL: 'Tutorial',
        IOS_MESSAGE: 'Drehe dein iPhone, um battlechoc im Vollbildmodus spielen zu können [0] oder verwende die Share-Funktion [1] und klicke auf [2] "Zum Home-Bildschirm"',
        JOIN_MULTIPLAYER: 'Multiplayer Spiel beitreten',
        TUTORIAL_CHOOSE_MESSAGE_1: 'Willkommen bei battlechoc! Es scheint das erste mal zu sein, dass du eine Runde spielst',
        TUTORIAL_CHOOSE_MESSAGE_2: 'Du kannst die Tutorial Kapitel durch einen Klick auf dieses Icon überspringen',
        TUTORIAL_CHOOSE_MESSAGE_3: 'Um mit dem Tutorial fortzufahren wähle zwischen dem ersten Zug, oder einem der beiden Spielfelder',
        TUTORIAL_FACTORY_MESSAGE_1: 'Du benötigst eine Schokoladenfabrik, um z.B. Kakaobäume oder Rumtrüffelkanonen bauen zu können',
        TUTORIAL_FACTORY_MESSAGE_2: 'Die Fabrik erlaubt dir 2 Gebäude pro Runde zu setzen',
        TUTORIAL_FACTORY_MESSAGE_3: 'Tipp: Wenn du eine Fabrik auf schwarze Schokolade baust, arbeitet sie besser und kann bis zu 3 Gebäude pro Runde herstellen',
        TUTORIAL_FACTORY_MESSAGE_4: 'Tippe auf eines der Felder, um die Fabrik zu setzen und mit dem Tutorial fortzufahren',
        TUTORIAL_TREES_MESSAGE_1: 'Die wichtigsten Gebäude in battlechoc sind der Kakaobaum und die Rumtrüffelkanone',
        TUTORIAL_TREES_MESSAGE_2: 'Du gewinnst das Spiel, wenn die Fabrik und alle Kanonen deines Gegners zerstört wurden',
        TUTORIAL_TREES_MESSAGE_3: 'Pflanze einen Baum, um jede Runde Kakao zu erhalten, welches du z.B. für den Bau von Kanonen benötigst',
        TUTORIAL_TREES_MESSAGE_4: 'Baue eine Kanone und greife deinen Gegner an, um mit dem Tutorial fortzufahren',
        TUTORIAL_TREES_MESSAGE_5: 'Tipp: Du erhältst 1.5x mehr Kakao pro Runde, wenn du einen Baum auf weiße Schokolade setzt',
        TUTORIAL_TREES_MESSAGE_6: 'battlechoc ist ein rundenbasiertes Strategiespiel. Eine Runde besteht aus Bau- und Angriffsphase',
        TUTORIAL_TREES_MESSAGE_7: 'Falls du keine Aktion mehr ausführen kannst, beendet das Spiel automatisch deine Phase bzw. Runde',
        TUTORIAL_TREES_MESSAGE_8: 'Wenn du vorzeitig eine Phase beenden möchtest, dann nutze den Vorspulen- bzw. Play-Button in der oberen Leiste',
        TUTORIAL_TREES_MESSAGE_9: 'Du hast Kakao erhalten! Baue nun eine Kanone. Wähle die Kanone aus, indem du auf das Icon tippst',
        TUTORIAL_TREES_MESSAGE_10: 'Jetzt kannst du deinen Gegner angreifen! Beende deine Bauphase und tippe auf die Fabrik deines Gegners',
        TUTORIAL_BUNNY_MESSAGE_1: 'Die Gegnerischen Gebäude sind mit Sahne verdeckt. Willst du etwas Licht ins Dunkle bringen?',
        TUTORIAL_BUNNY_MESSAGE_2: 'Benutze den Spionage-Osterhase, um die Felder des Gegners aufzudecken',
        TUTORIAL_BUNNY_MESSAGE_3: 'Wähle ein Spielfeld aus. Der Osterhase wird die Felder um das ausgewählte Feld aufdecken',
        TUTORIAL_BUNNY_MESSAGE_4: 'Oh nein! Dein Gegner besitzt ebenfalls einen Spionage-Osterhasen ...',
        TUTORIAL_BUNNY_MESSAGE_5: 'Du hast etwas Kakao geerntet. Damit kannst du eine Weihnachtsfabrik bauen. Die Weihnachtsfabrik verhindert Spionage-Angriffe',
        TUTORIAL_BUNNY_MESSAGE_6: 'Wenn der Osterhase ein Gebiet aufdecken möchte, indem eine Weihnachtsfabrik steht..',
        TUTORIAL_BUNNY_MESSAGE_7: '.. wird er eingeschmolzen und du erhältst eine heiße Schokoladenschleuder!',
        TUTORIAL_BUNNY_MESSAGE_8: 'Jetzt ist dein Gegner am Zug. Diese Animation ..',
        TUTORIAL_BUNNY_MESSAGE_9: '.. bedeutet, dass dein Gegner nachdenkt',
        TUTORIAL_FOUNTAIN_MESSAGE_1: 'Baue einen Kakaobaum und greife die gegnerische Fabrik an',
        TUTORIAL_FOUNTAIN_MESSAGE_2: 'Zerstöre die Schokoladenfabrik deines Gegners um das Tutorial zu beenden',
        TUTORIAL_FOUNTAIN_MESSAGE_3: 'Oh nein! Dein Gegner hat einen Schokoladenschild',
        TUTORIAL_FOUNTAIN_MESSAGE_4: 'Normale Rumtrüffel können das Schild nicht durchdringen',
        TUTORIAL_FOUNTAIN_MESSAGE_5: 'Ernte genügend Kakao um eine Fruchtkanone zu bauen',
        TUTORIAL_FOUNTAIN_MESSAGE_6: 'Super! Du kannst nun deine Kannonen mit einer Frucherweiterung upgraden',
        TUTORIAL_FOUNTAIN_MESSAGE_7: 'Früchte können zwar den Schild durchdringen, jedoch zerstören sie nur den Schokobrunnen und Sahne',
        TUTORIAL_FOUNTAIN_MESSAGE_8: 'Aber sobald der Schokobrunnen zerstört ist, können deine Rumtrüffelkanonen die Fabrik deines Gegners zerstören!',   
        TUTORIAL_TITLE_1: 'Interaktives battlechoc Tutorial',
        TUTORIAL_TITLE_2: 'Die Schokoladenfabrik',
        TUTORIAL_TITLE_3: 'Kakaobäume und Rumtrüffelkanonen',
        TUTORIAL_TITLE_4: 'Die Wahrheit über Weihnachten und Ostern',
        TUTORIAL_TITLE_5: 'Schokobrunnen und Früchte',
        TUTORIAL_DIALOG_TITLE_BEFORE: 'Du hast es fast geschafft',
        TUTORIAL_DIALOG_TITLE: 'Du hast es geschafft!',
        TUTORIAL_DIALOG_MESSAGE: 'Nun bist du bereit um eine richtige Runde battlechoc zu spielen. Willst du direkt starten?',
        TUTORIAL_DIALOG_HINT: 'Es ist dir nun möglich aus dem Einstellungsmenü das Tutorial neu zu starten',
        TUTORIAL_DIALOG_BACK: 'Zum Menü',
        TUTORIAL_DIALOG_PLAY_GAME: 'Jetzt Spielen',
        TUTORIAL_CHOOSE_NAME_INFO: 'Bevor wir starten solltest du dir unbedingt einen coolen Namen überlegen! Freunde können dich anhand deines Names wiederkennen und deine Gegner bringt er vielleicht zum Zittern.',
        ACTIONS: 'Aktionen',
        OPPONENT: 'Gegenspieler',
        TURNS: 'Züge',
        MATCH_TIME: 'Spielzeit',
        LAST_ACTION: 'Letzte Aktion',
        POTENTIAL_COINS: 'Mögliche Coins',
        RANDOM_OPPONENT: 'Zufälliger Gegner',
        SHARE_LINK: 'Profil-Link teilen',
        FRIENDS: 'Freunde',
        START_GAME: 'Spiel starten',
        JOIN_GAME: 'Spiel beitreten',
        FRIENDS_INFO: 'Du hast zur Zeit noch keine Freunde',
        ADD_FRIEND: 'Als Freund hinzufügen',
        REMOVE_FRIEND: 'Freund entfernen',
        SEARCH_PLAYERS: 'Spieler suchen',
        SEARCH_USER_INFO: 'Es wurde kein Spieler gefunden',
        CHOCLAB_INCREASED_BY: 'erhöht um',
        ATTRIBUTE_NAME: attribute => {
            switch (attribute) {
                case 'hp': return 'Lebenspunkte';
                case 'area': return 'Reichweite';
                case 'buildingsPerTurn': return 'Gebäude pro Runde';
                case 'cacaoPerTurn': return 'Kakao pro Runde';
                case 'attack': return 'Angriff';
                case 'fortune': return 'Glück';
                default: return 'Unbekannt';
            }
        },
        WARNING_GAME_NOT_JOINABLE: 'Das gewünschte Spiel wurde bereits beendet',
        WARNING_PLAYER_NOT_FOUND: name => 'Spieler ' + name + ' wurde nicht gefunden',
        SURRENDER: 'Aufgeben',
        SURRENDER_GAME: 'Spiel aufgeben',
        SURRENDER_GAME_TEXT: name => 'Möchtest du das Spiel gegen ' + name + ' wirklich aufgeben?',
        PWA_UPDATE_AVAILABLE: 'Eine neue Version ist verfügbar und wird nach Neustart der PWA, oder des Browsers, verwendet',
        PWA_OFFLINE_MODE: 'Du benutzt battlechoc ohne Internetverbindung, daher ist ausschließlich der Singleplayer-Modus verfügbar',
        PWA_ONLINE_MODE: 'Du bist wieder mit dem Internet verbunden',
        UPDATE_LEVEL_FAILED: upgrade => 'Es war nicht möglich das ' + (upgrade ? 'Up' : 'Down') + 'grade durchzuführen. Überprüfe deine Internetverbindung',
        NO_HEALTHY_INTERNET: 'Es gab Verbindungsprobleme. Überprüfe bitte deine Internetverbindung und versuche es erneut',
        SESSION_REFRESH_FAILED: 'Fehler beim Aktualisieren der Multiplayer Sessions. Überprüfe bitte deine Internetverbindung',
        FETCH_HIGHSCORE_FAILED: 'Fehler beim Laden des Highscores. Überprüfe bitte deine Internetverbindung'
    }
};


export default languages;