import { EntityType, AttackType } from 'battlechoc-shared-functions';

const languages = {
    en: {
        SIGNINORUP: 'Sign in',
        NEW_GAME: 'New Game',
        MAIN_MENU_SINGLEPLAYER: 'Singleplayer',
        MAIN_MENU_MULTIPLAYER: 'Multiplayer',
        MAIN_MENU_CHOCLAB: 'Choclab',
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
        PLAYERLIST_SCORE: 'Score',
        PLAYERLIST_NAME: 'Name',
        PLAYERLIST_ACTIONS: 'Actions',
        CHOCLAB_UPGRADE: 'Upgrade',
        CHOCLAB_DOWNGRADE: 'Downgrade',
        CHOCLAB_LEVEL: 'Level',
        MULTIPLAYER_INFO_HEADER: 'You do not have any open multiplayer games',
        MULTIPLAYER_INFO_HEADER2: 'Use the buttons above to',
        MULTIPLAYER_INFO_CASINO: 'Challenge a random opponent',
        MULTIPLAYER_INFO_FRIENDS: 'Pick one from your friends list',
        MULTIPLAYER_INFO_SHARE: 'Share a link to your profile',
        MULTIPLAYER_INFO_SEARCH: 'Search for players using their names',
        MULTIPLAYER_INFO_HIGHSCORE: 'Take a look at the global high score',
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
        JAPANESE: 'Japanese',
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
                case EntityType.DONUT_FACTORY: return 'Donut Factory';
                case EntityType.DONUT_PORTAL_RED: return 'Red portal donut';
                case EntityType.DONUT_PORTAL_BLUE: return 'Blue portal donut';
                case EntityType.DONUT_STOP_PINK: return 'Pink stop donut';
                case EntityType.DONUT_SURPRISE_YELLOW: return 'Yellow surprise donut';
                case EntityType.DONUT_HEALTH_GREEN: return 'Green health donut';
                case EntityType.DONUT_CREAM_WHITE: return 'White cream donut';
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
                        advantages: 'Buildings per turn +' + building.buildingsPerTurn
                    }
                case EntityType.CACAOTREE:
                    return {
                        info: 'The cacao tree offers you all the resources you need',
                        costs: 'Cacao costs: ' + building.costs,
                        advantages: 'Cacao per turn +' + building.cacaoPerTurn
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
                case EntityType.DONUT_FACTORY:
                    return {
                        info: 'The donut factory is going to produce donut traps which can be very dangerous to your opponent',
                        costs: 'Cacao costs: ' + building.costs,
                        advantages: `Produces a donut per turn with a probability of ${building.donutProbability * 100}%` 
                    }
                case EntityType.DONUT_PORTAL_RED:
                case EntityType.DONUT_PORTAL_BLUE:
                    return {
                        info: 'If the blue donut is triggered by any attack, a portal will swap the fields and all entities with it\'s corresponding red donut'
                    }
                case EntityType.DONUT_CREAM_WHITE:
                    return {
                        info: 'If the white donut is triggered by any attack, the 5x5 area around the donut will be filled with cream'
                    }
                case EntityType.DONUT_HEALTH_GREEN:
                    return {
                        info: 'If the green donut is triggered by any attack, the 5x5 area around the donut will be fully healed'
                    }
                case EntityType.DONUT_STOP_PINK:
                    return {
                        info: 'If the pink donut is triggered by any attack, the opponent attack phase will stop immediately'
                    }
                case EntityType.DONUT_SURPRISE_YELLOW:
                    return {
                        info: 'If the yellow donut is triggered by any attack, it will randomly heal it\'s 5x5 area, fill it with cream, or stop the opponent\'s attack phase immediately'
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
                case 'donutProbability': return 'Donut probability';
                case 'donutTypes': return 'Donut types';
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
        FETCH_HIGHSCORE_FAILED: 'Failed to fetch highscore. Please check your internet connection',
        WARNING_GAME_NOT_JOINABLE_VIA_URL: 'The selected game is already ended or not associated with your account',
        ERROR_GAME_NOT_JOINABLE_VIA_URL: 'Failed to start the game. Please check your internet connection',
        TRY_TO_JOIN_GAME: 'We try to connect you directly to your multiplayer game. Please wait a moment',
        TRY_TO_SHOW_PLAYER_ACCOUNT: 'Loading player account. Please wait a moment',
        NOTIFICATION_PERMISSION_INFO: 'We will now request your permission to inform you if someone challenges you, or an opponent has finished his turn and you are up to play',
        NO_ACCOUNT_INFO: 'You are currently not logged in. Use the settings icon to login or just start a new game on the main page for creating a new one'
    },
    de: {
        SIGNINORUP: 'Anmelden',
        NEW_GAME: 'Neues Spiel',
        MAIN_MENU_SINGLEPLAYER: 'Singleplayer',
        MAIN_MENU_MULTIPLAYER: 'Multiplayer',
        MAIN_MENU_CHOCLAB: 'Choclab',
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
        PLAYERLIST_SCORE: 'Punkte',
        PLAYERLIST_NAME: 'Name',
        CHOCLAB_UPGRADE: 'Upgrade',
        CHOCLAB_DOWNGRADE: 'Downgrade',
        CHOCLAB_LEVEL: 'Level',
        PLAYERLIST_ACTIONS: 'Aktionen',
        MULTIPLAYER_INFO_HEADER: 'Du hast zur Zeit keine offenen Multiplayer-Partien.',
        MULTIPLAYER_INFO_HEADER2: 'Benutze die Buttons oben, um',
        MULTIPLAYER_INFO_CASINO: 'einen zufälligen Spieler herauszufordern',
        MULTIPLAYER_INFO_FRIENDS: 'deine Freundesliste einzusehen',
        MULTIPLAYER_INFO_SHARE: 'deinen Profillink zu teilen',
        MULTIPLAYER_INFO_SEARCH: 'nach einem Spieler zu suchen',
        MULTIPLAYER_INFO_HIGHSCORE: 'dir den aktuellen Highscore anzuschauen',
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
        JAPANESE: 'Japanisch',
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
                case EntityType.DONUT_FACTORY: return 'Donutfabrik';
                case EntityType.DONUT_PORTAL_RED: return 'Roter Portal-Donut';
                case EntityType.DONUT_PORTAL_BLUE: return 'Blauer Portal-Donut';
                case EntityType.DONUT_STOP_PINK: return 'Pinker Stop-Donut';
                case EntityType.DONUT_SURPRISE_YELLOW: return 'Gelber Überraschungs-Donut';
                case EntityType.DONUT_HEALTH_GREEN: return 'Grüner Heilungs-Donut';
                case EntityType.DONUT_CREAM_WHITE: return 'Weißer Sahne-Donut';
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
                case EntityType.DONUT_FACTORY:
                    return {
                        info: 'Die Donutfabrik stellt Donutfallen her, die dem Gegner sehr gefährlich werden können',
                        costs: 'Kakaokosten: ' + building.costs,
                        advantages: `Produziert pro Runde einen Donut mit einer Wahrscheinlichkeit von ${building.donutProbability * 100}%` 
                    }
                case EntityType.DONUT_PORTAL_RED:
                case EntityType.DONUT_PORTAL_BLUE:
                    return {
                        info: 'Wenn der blaue Donut durch einen Angriff ausgelöst wird, vertauscht er durch ein Portal sein Feld und alle Einheiten mit dem dazugehörigen roten Donut'
                    }
                case EntityType.DONUT_CREAM_WHITE:
                    return {
                        info: 'Wenn der weiße Donut durch einen Angriff ausgelöst wird, füllt er seine 5x5 Umgebung mit Sahne'
                    }
                case EntityType.DONUT_HEALTH_GREEN:
                    return {
                        info: 'Wenn der grüne Donut durch einen Angriff ausgelöst wird, heilt er seine 5x5 Umgebung vollständig'
                    }
                case EntityType.DONUT_STOP_PINK:
                    return {
                        info: 'Wenn der pinke Donut durch einen Angriff ausgelöst wird, endet die Angriffsphase des Gegners sofort'
                    }
                case EntityType.DONUT_SURPRISE_YELLOW:
                    return {
                        info: 'Wenn der gelbe Donut durch einen Angriff ausgelöst wird, füllt er entweder zufällig seine 5x5 Umgebung mit Sahne, heilt sie vollständig, oder beendet die Angriffsphase des Gegners sofort'
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
                case 'donutProbability': return 'Donut Wahrscheinlichkeit';
                case 'donutTypes': return 'Donut Arten';
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
        FETCH_HIGHSCORE_FAILED: 'Fehler beim Laden des Highscores. Überprüfe bitte deine Internetverbindung',
        WARNING_GAME_NOT_JOINABLE_VIA_URL: 'Das gewählte Spiel wurde bereits beendet, oder ist nicht deinem Account zugeordnet',
        ERROR_GAME_NOT_JOINABLE_VIA_URL: 'Spielstart fehlgeschlagen. Bitte überprüfe deine Internetverbindung',
        TRY_TO_JOIN_GAME: 'Bitte warte kurz. Wir versuchen dich direkt mit deinem Multiplayerspiel zu verbinden',
        TRY_TO_SHOW_PLAYER_ACCOUNT: 'Einen Augenblick bitte. Spielerinformationen werden geladen',
        NOTIFICATION_PERMISSION_INFO: 'Wir werden dich gleich um Erlaubnis fragen, dich informieren zu dürfen, falls jemand dich herausfordert, oder ein Gegner seinen Zug beendet hat und du an der Reihe bist',
        NO_ACCOUNT_INFO: 'Du bist zur Zeit nicht angemeldet. Melde dich im Einstellungsmenü an, oder starte einfach ein neues Spiel auf der Hauptseite, um einen neuen Account zu erstellen'
    },
    jp: {
        SIGNINORUP: 'サインイン',
        NEW_GAME: '新しいゲーム',
        MAIN_MENU_SINGLEPLAYER: 'シングルプレーヤー',
        MAIN_MENU_MULTIPLAYER: 'マルチプレイヤー',
        MAIN_MENU_CHOCLAB: 'ショコラデンラボ',
        SIGN_OUT: 'サインアウト',
        ACCOUNTINFOS: 'アカウント情報',
        ACCOUNTINFOS_PREVIEW: '近日中に、アカウントとプレーヤーの統計に関する情報を提供します。',
        ACCOUNT_OVERVIEW_ASSOCIATION: 'あなたのアカウントはに関連付けられています',
        SETTINGS: '設定',
        SETTINGS_ATTENTION_TEXT: '注意、上のボタンをもう一度押すと、現在のゲームを放棄し、相手が勝ちます',
        ACCOUNT_OVERVIEW_CREATE_INFO: 'アカウントをデバイス間で共有し、デバイスが失われた場合のバトルチョックの進捗を復元するには、これらのオプションのいずれかに接続することができます。',
        ACCOUNT_OVERVIEW_LEVEL: 'レベル',
        ACCOUNT_OVERVIEW_RANK: 'ランク',
        ACCOUNT_OVERVIEW_WON: '勝った',
        ACCOUNT_OVERVIEW_DRAWN: '描かれた',
        ACCOUNT_OVERVIEW_LOST: '失われた',
        ACCOUNT_OVERVIEW_COINS: '硬貨',
        PLAYERLIST_SCORE: 'スコア',
        PLAYERLIST_NAME: '名前',
        PLAYERLIST_ACTIONS: '行動',
        CHOCLAB_UPGRADE: 'アップグレード',
        CHOCLAB_DOWNGRADE: 'ダウングレード',
        CHOCLAB_LEVEL: 'レベル',
        MULTIPLAYER_INFO_HEADER: 'オープンマルチプレイヤーゲームはありません',
        MULTIPLAYER_INFO_HEADER2: '上記のボタンを使用して',
        MULTIPLAYER_INFO_CASINO: 'ランダムな相手に挑戦',
        MULTIPLAYER_INFO_FRIENDS: '友達リストから1つを選択してください',
        MULTIPLAYER_INFO_SHARE: 'プロフィールへのリンクを共有する',
        MULTIPLAYER_INFO_SEARCH: '名前を使用してプレイヤーを検索する',
        MULTIPLAYER_INFO_HIGHSCORE: 'グローバルハイスコアをご覧ください',
        SETTINGS_QUIT: 'ゲームをやめる',
        SETTINGS_PLAYER_NAME_IN_USE: 'すでに使用中のユーザー名',
        SETTINGS_PLAYER_NAME_INVALID: 'ユーザー名が無効です（3〜15文字または数字、最初の記号は文字でなければなりません）',
        HUD_RESUME_GAME: 'ゲームを再開',
        HUD_ASK_NEW_OR_RESUME: '新しいゲームを開始しますか、それとも最後のゲームを再開しますか？',
        HUD_NEW_GAME: '新しいゲーム',
        GAME_END_OVERVIEW_ATTACKS: '攻撃',
        GAME_END_OVERVIEW_ENTITIES: 'エンティティ全体',
        GAME_END_OVERVIEW_ESPIONAGES: 'スパイ',
        GAME_END_OVERVIEW_MOLTEN_FIELDS: '溶融フィールド',
        GERMAN: 'ドイツ人',
        ENGLISH: '英語',
        JAPANESE: '日本語',
        LANGUAGE: '言語',
        BUTTON_BACK: 'バック',
        INVITATION: 'バトルチョックマルチプレイヤーゲームに参加しましょう！',
        TOOLTIP_INITIAL_TURN_TITLE: '最初のターン',
        TOOLTIP_INITIAL_TURN_MESSAGE: '最初のラウンドでは、競技場または最初の動きを選択できます',
        TOOLTIP_INITIAL_TURN_OPPONENT: name => name + ' ゲームフィールドを選択できるようになりました',
        TOOLTIP_BUILDING_TITLE: (type) => {
            switch (type) {
                case EntityType.CREAM: return 'クリーム';
                case EntityType.FACTORY_EXTENSION: return '工場拡張';
                case EntityType.FACTORY: return 'チョコレート工場';
                case EntityType.HOT_CHOCOLATE_BALLISTA: return 'ホットチョコレートバリスタ';
                case EntityType.CACAOTREE: return 'カカオの木';
                case EntityType.RUM_TRUFFLE_CANNON: return 'ラムトリュフキャノン';
                case EntityType.XMAS_FACTORY: return 'クリスマス工場';
                case EntityType.SPYING_EASTER_BUNNY: return 'イースターバニーをスパイ';
                case EntityType.CHOCOLATE_FOUNTAIN: return 'チョコレート噴水';
                case EntityType.FRUIT_CANNON: return 'フルーツキャノン';
                case EntityType.DONUT_FACTORY: return 'ドーナツ工場';
                case EntityType.DONUT_PORTAL_RED: return '赤いポータルドーナツ';
                case EntityType.DONUT_PORTAL_BLUE: return '青いポータルドーナツ';
                case EntityType.DONUT_STOP_PINK: return 'ピンクストップドーナツ';
                case EntityType.DONUT_SURPRISE_YELLOW: return 'イエローサプライズドーナツ';
                case EntityType.DONUT_HEALTH_GREEN: return '緑の健康ドーナツ';
                case EntityType.DONUT_CREAM_WHITE: return 'ホワイトクリームドーナツ';
                default: return '知らない';
            }
        },
        TOOLTIP_BUILDING_INFO: (type, building) => {
            switch (type) {
                case EntityType.CREAM:
                    return {
                        info: 'クリーム色の建物は敵から隠されます。クリームと建物の順序は関係ありません。',
                        costs: 'カカオの費用： ' + building.costs
                    }
                case EntityType.FACTORY_EXTENSION:
                    return {
                        info: 'ファクトリ拡張は、ファクトリのすぐ隣にのみ配置できます。',
                        costs: 'カカオの費用： ' + building.costs,
                        advantages: 'ーンごとの建物+' + building.buildingsPerTurn
                    }
                case EntityType.CACAOTREE:
                    return {
                        info: 'カカオの木はあなたに必要なすべてのリソースを提供します。',
                        costs: 'カカオの費用： ' + building.costs,
                        advantages: 'ターンごとのカカオ+' + building.cacaoPerTurn
                    }
                case EntityType.RUM_TRUFFLE_CANNON:
                    return {
                        info: 'ラムトリュフ大砲が勝利へと導く。',
                        costs: 'カカオの費用： ' + building.costs,
                        advantages: 'ターンごとの攻撃+1'
                    }
                case EntityType.XMAS_FACTORY:
                    return {
                        info: 'イースターのウサギがサンタクロースに溶け込んでいるという噂は本当です！イースターバニーがクリスマス工場の近くに来ると、プレゼントがあなたを待っています。',
                        costs: 'カカオの費用： ' + building.costs
                    }
                case EntityType.SPYING_EASTER_BUNNY:
                    return {
                        info: 'スパイイースターバニーは、相手のクリームの下を見ることができますが、クリスマス工場に注意してください。',
                        costs: 'カカオの費用： ' + building.costs,
                        advantages: 'ターンごとのスパイ+1'
                    }
                case EntityType.CHOCOLATE_FOUNTAIN:
                    return {
                        info: 'チョコレートの噴水は、ラムトリュフの大砲攻撃から周囲のすべての建物を守ります。',
                        costs: 'カカオの費用： ' + building.costs,
                        advantages: '噴水の周りの3x3セルの領域を確保します。'
                    }
                case EntityType.FRUIT_CANNON:
                    return {
                        info: '果物の大砲は、敵のクリームとチョコレートの噴水を破壊します。',
                        costs: 'カカオの費用： ' + building.costs,
                        advantages: 'ターンごとのフルーツ攻撃+1'
                    }
                case EntityType.DONUT_FACTORY:
                    return {
                        info: 'ドーナツ工場では、ドーナツトラップを作成しますが、これは相手にとって非常に危険な場合があります。',
                        costs: 'カカオの費用： ' + building.costs,
                        advantages: `確率ごとにドーナツを1ターンに生成します${building.donutProbability * 100}%` 
                    }
                case EntityType.DONUT_PORTAL_RED:
                case EntityType.DONUT_PORTAL_BLUE:
                    return {
                        info: '青いドーナツが何らかの攻撃によってトリガーされると、ポータルはフィールドとすべてのエンティティを対応する赤いドーナツと交換します'
                    }
                case EntityType.DONUT_CREAM_WHITE:
                    return {
                        info: '白いドーナツが何らかの攻撃によってトリガーされた場合、ドーナツの周りの5x5領域はクリームで満たされます'
                    }
                case EntityType.DONUT_HEALTH_GREEN:
                    return {
                        info: '緑色のドーナツが何らかの攻撃によってトリガーされた場合、ドーナツの周囲の5x5の領域は完全に回復します'
                    }
                case EntityType.DONUT_STOP_PINK:
                    return {
                        info: 'ピンクドーナツが攻撃によってトリガーされた場合、相手の攻撃フェーズはすぐに停止します'
                    }
                case EntityType.DONUT_SURPRISE_YELLOW:
                    return {
                        info: '黄色のドーナツが攻撃によってトリガーされた場合、ランダムに5x5の領域を回復するか、クリームで満たすか、すぐに敵の攻撃フェーズを停止します'
                    }
                default: return { info: '不明な建物' }
            }
        },
        TOOLTIP_INITIAL_PLACEMENT_TITLE: '初期配置',
        TOOLTIP_INITIAL_PLACEMENT_MESSAGE: 'これで、一度工場を建てることができます。工場を慎重に設定してください：破壊された場合、他の建物を建てることはできません',
        TOOLTIP_BUILD_PHASE_TITLE: 'ビルド段階',
        TOOLTIP_BUILD_PHASE_MESSAGE: '以下のリストから建物を選択し、自由なフィールドのいずれかに構築します。クリームは半透明で表示されます。クリーム色で建てられた建物は敵には見えません',
        TOOLTIP_ATTACK_PHASE_TITLE: '攻撃フェーズ',
        TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE: (attackType) => {
            switch (attackType) {
                case AttackType.TRUFFLE: return 'ラムトリュフ';
                case AttackType.FRUIT: return 'フルーツ';
                case AttackType.HOT_CHOCOLATE: return 'ホットチョコレート';
                case AttackType.BUNNY: return 'イースターバニーをスパイ';
                default: return '知らない';
            }
        },
        TOOLTIP_ATTACK_PHASE_MESSAGE: '敵の建物をクリックして破壊します。ヒント：スマートな敵はクリームの中に建物を隠します',
        TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE: (attackType) => {
            switch (attackType) {
                case AttackType.TRUFFLE: return '建物とクリームを破壊します。チョコレートファウンテンシールドで緩和できます。';
                case AttackType.FRUIT: return 'クリームとチョコレートの噴水を破壊します。他の建物は果物の大砲によって害を受けません。';
                case AttackType.HOT_CHOCOLATE: return '建物、クリーム、さらには攻撃されたゲームフィールドの一部を破壊します。チョコレートファウンテンシールドでは緩和できません。';
                case AttackType.BUNNY: return '攻撃されたセルの周りの3x3領域内のクリームの下にあるすべての建物を明らかにします。近くのX-mas工場に巻き込まれます。';
                default: return '知らない';
            }
        },
        MESSAGE_WIN_GAME: 'おめでとう！このゲームに勝った',
        MESSAGE_LOST_GAME: 'あなたが負けた',
        MESSAGE_DRAW_GAME: 'ゲームを描く！',
        META_DESCRIPTION: 'チョコレートとゲームが好きですか？今すぐ始めて、カカオ風味のターンベースの戦略ゲームであるbattlechocをプレイしてください。ゲームに関しては、ウェブサイトよりもアプリを好みますか？もちろん、バトルチョックをホーム画面に追加して、いつでもどこでもオフラインでプレイできます！',
        META_KEYWORDS: 'チョコレート、ゲーム、戦略ゲーム、ボードゲーム、PWA、ココア、ターンベース、チョコレートガン、ココアツリー',
        REPORT_CUSTOM_MESSAGE: '追加メッセージ',
        REPORT_CUSTOM_MESSAGE_PLACEHOLDER: '問題は後に発生します...',
        REPORT_DEVICE_INFO: 'デバイス情報を追加する',
        REPORT_PROBLEM: '問題を報告する',
        RESTART_TUTORIAL: '再起動チュートリアル',
        ERROR_SENDING_PROBLEM_REPORT: '問題レポートの送信エラー。インターネット接続を確認してください',
        SUCCESSFULLY_SENDING_PROBLEM_REPORT: '問題レポートが正常に送信されました！',
        REPORT_INFORMATION: 'レポートにはターン履歴が自動的に含まれるため、ゲームと問題を再現できます。追加メッセージの形でのさらなる観察、またはデバイス情報（オペレーティングシステムなど）は非常に役立ちます。この情報は、バグが修正された直後に削除するか、問題を再現できませんでした。ご協力いただきありがとうございます！',
        INFO_IMPRESS: '感動',
        INFO_IMPRESS_COUNTRY: 'ドイツ',
        INFO_IMPRESS_PHONE: '電話',
        INFO_IMPRESS_EXECUTIVE_DIRECTORS: '専務理事',
        INFO_PRIVACY_POLICY: '個人情報保護方針',
        INFO_PRIVACY_POLICY_TEXT: '現在、バトルチョックでお金を稼ぐことはありません。無料でプレイできます。私たちは常にあなたのデータを保護しようとしています。そのため、2つの方法でデータを収集するだけです。まず、バグ報告を手動で送信すると、データが収集されます。これは、ゲームの状態と移動履歴を保存する場所です。チェックボックスを有効にすると、ブラウザ情報とオペレーティングシステムを指定することもできます。エラーを再現できるようにするために、追加のメッセージが役立つ場合がよくあります。これは、指定時に保存されます。バグを再現して解決できたら、この情報をすぐに削除しますが、遅くともエラーレポートを送信してから2か月後です。データを収集する2番目の方法は、Google Web Analyticsの使用です。これについては、次の段落で詳しく説明します。',
        INFO_GOOGLE_ANALYTICS: 'battlechocを適応させ、継続的に最適化するために、Google Inc.のWeb分析サービスであるGoogle Web Analytics（1940 Amphitheatre Parkway、Mountain View、CA 94043、USA、以下「Google」と呼びます）を使用します。このコンテキストでは、仮名のユーザープロファイルが作成され、Cookieが使用されます。Cookieは、ブラウザーによってデバイスに自動的に保存される情報を一時的に保存するための小さなテキストファイルです。 Cookieにはウイルスは含まれておらず、危険ではありません。Cookieによって生成される、このWebサイトの使用に関する情報。',
        INFO_GOOGLE_ANALYTICS_OPERATING_SYSTEM: 'オペレーティング・システム',
        INFO_GOOGLE_ANALYTICS_BROWSER_TYPE: 'ブラウザの種類/バージョン',
        INFO_GOOGLE_ANALYTICS_REFERRER_URL: 'リファラーURL（以前にアクセスしたページ）',
        INFO_GOOGLE_ANALYTICS_HOST_NAME: 'アクセスしているコンピューターのホスト名（IPアドレス）',
        INFO_GOOGLE_ANALYTICS_SERVER_REQUEST: 'サーバーリクエストの時間',
        INFO_GOOGLE_ANALYTICS_PREVENT: '米国のGoogleサーバーに転送され、そこに保存されます。この情報は、Webサイトの使用を評価し、市場、UI / UX調査のためのWebサイトアクティビティに関するレポートを生成するために使用されます。この情報は、法律で義務付けられている場合、またはそのような第三者が会社に代わって情報を処理する場合、第三者に開示される場合があります。いかなる状況でも、IPアドレスがGoogleが保持する他のデータと統合されることはありません。 IPアドレスは匿名化されているため、マッピングはできません（IPマスキング）。ブラウザで適切な設定を選択することにより、Cookieの使用を拒否できます。ブラウザのアドオン（https：// tools.google.com/dlpage/gaoptout?hl=en）。ブラウザーアドオンの代替手段として、特にモバイルデバイス上のブラウザーの場合、このリンクをクリックして、Googleアナリティクスがデータを収集しないようにすることができます。オプトアウトCookieは、このWebサイトにアクセスしたときにデータが将来収集されないように設定されています。オプトアウトCookieはこのブラウザでのみ有効であり、当社のWebサイトでのみ有効であり、デバイスに保存されます。このブラウザでCookieを削除した場合、オプトアウトCookieを再度設定する必要があります。 Googleアナリティクスのヘルプ（https://policies.google.com/?hl=en）で、Googleアナリティクスに関連するデータ保護の詳細を確認できます。サービスプロバイダーは、EU-USプライバシー契約の一部です。',
        TUTORIAL: 'チュートリアル',
        IOS_MESSAGE: 'iOSでバトルチョックをフルスクリーンモードでプレイするには、iPhone [0]を回転するか、共有アイコン[1]を使用して[2] [ホーム画面に追加]を選択する必要があります',
        JOIN_MULTIPLAYER: 'マルチプレイヤーゲームに参加する',
        TUTORIAL_CHOOSE_MESSAGE_1: 'battlechocへようこそ！初めてプレイしているようです',
        TUTORIAL_CHOOSE_MESSAGE_2: '上のこのアイコンをクリックして、チュートリアルページをスキップできます。',
        TUTORIAL_CHOOSE_MESSAGE_3: 'このチュートリアルを続けるには、最初のターンまたはゲームフィールドのいずれかを選択してください',
        TUTORIAL_FACTORY_MESSAGE_1: 'ビルドするにはカカオの木やラムトリュフの大砲、チョコレート工場を建設する必要があります',
        TUTORIAL_FACTORY_MESSAGE_2: '工場では、ターンごとに2つの建物を建てることができます',
        TUTORIAL_FACTORY_MESSAGE_3: 'ヒント：ブラックチョコレートで工場を建設すると、工場の性能が向上し、1ターンあたり最大3つの建物を生産できるようになります。',
        TUTORIAL_FACTORY_MESSAGE_4: 'いずれかのフィールドをタップして工場を配置し、チュートリアルを続けます',
        TUTORIAL_TREES_MESSAGE_1: '最も重要な建物はカカオの木とラムトリュフの大砲です',
        TUTORIAL_TREES_MESSAGE_2: '工場と敵の大砲をすべて破壊すると、ゲームに勝ちます',
        TUTORIAL_TREES_MESSAGE_3: 'カカオを得るためにいくつかの木を植えます。大砲を作るのに必要になる',
        TUTORIAL_TREES_MESSAGE_4: '大砲を建設し、相手の工場を攻撃してチュートリアルを続けます',
        TUTORIAL_TREES_MESSAGE_5: 'ヒント：ホワイトフィールドにカカオの木を構築すると、ラウンドごとに1.5倍以上のカカオが生成されます',
        TUTORIAL_TREES_MESSAGE_6: 'battlechocはターンベースの戦略ゲームです。ターンは2つのゲームフェーズで構成されます：ビルドと攻撃',
        TUTORIAL_TREES_MESSAGE_7: 'ゲームは、他のアクションを実行できない場合に通知し、次のフェーズまたはターンにガイドします',
        TUTORIAL_TREES_MESSAGE_8: 'フェーズを早く終了する場合は、上の再生ボタンまたは早送りボタンを使用できます',
        TUTORIAL_TREES_MESSAGE_9: '見て：あなたはいくつかのカカオを得ました！これで大砲を作ることができます。アイコンをタップして大砲を選択します',
        TUTORIAL_TREES_MESSAGE_10: 'これで、相手を攻撃できます。ビルドフェーズを完了して、相手のファクトリーをタップするだけです！',
        TUTORIAL_BUNNY_MESSAGE_1: '相手のゲームフィールドはクリームで満たされています。暗闇に光を取り入れたいですか？',
        TUTORIAL_BUNNY_MESSAGE_2: 'スパイイースターバニーを使用して、敵のゲームフィールドにあるすべてのクリームを見つけます',
        TUTORIAL_BUNNY_MESSAGE_3: 'バニーは、選択したフィールドの周りの領域を明らかにしようとしています',
        TUTORIAL_BUNNY_MESSAGE_4: '大野！相手にはスパイイースターバニーもいます...',
        TUTORIAL_BUNNY_MESSAGE_5: 'カカオが入った。これで、X-masファクトリを構築する準備が整いました。スパイ攻撃からあなたを守ります',
        TUTORIAL_BUNNY_MESSAGE_6: 'バニーがX-masファクトリーを含むエリアをスパイする場合',
        TUTORIAL_BUNNY_MESSAGE_7: 'それは溶けてしまい、あなたはホットチョコレートバリスタを受け取ります！',
        TUTORIAL_BUNNY_MESSAGE_8: '今、あなたの対戦相手の番です。このアニメーション..',
        TUTORIAL_BUNNY_MESSAGE_9: '..相手が考えていることを示します',
        TUTORIAL_FOUNTAIN_MESSAGE_1: 'カカオの木を構築してから、相手の工場を攻撃します',
        TUTORIAL_FOUNTAIN_MESSAGE_2: 'このチュートリアルを完了するには、敵の工場を破壊します',
        TUTORIAL_FOUNTAIN_MESSAGE_3: 'ああ、相手はカカオシールドを持っています',
        TUTORIAL_FOUNTAIN_MESSAGE_4: 'トリュフはシールドを通過できません',
        TUTORIAL_FOUNTAIN_MESSAGE_5: 'フルーツキャノンを作るのに十分なココアを集めてください',
        TUTORIAL_FOUNTAIN_MESSAGE_6: 'すごい！フルーツエクステンションで大砲をアップグレードできるようになりました',
        TUTORIAL_FOUNTAIN_MESSAGE_7: '果物はシールドを通過できますが、チョコレートの噴水とクリームのみを破壊できます',
        TUTORIAL_FOUNTAIN_MESSAGE_8: 'チョコレートの噴水が破壊されたら、トリュフで工場を攻撃できます',
        TUTORIAL_TITLE_1: 'インタラクティブバトルチョックチュートリアル',
        TUTORIAL_TITLE_2: 'チョコレート工場',
        TUTORIAL_TITLE_3: '木と大砲について',
        TUTORIAL_TITLE_4: 'クリスマスとバニー',
        TUTORIAL_TITLE_5: '果物とチョコレートの噴水について',
        TUTORIAL_DIALOG_TITLE_BEFORE: 'あなたはほとんどそこにいます',
        TUTORIAL_DIALOG_TITLE: 'できたね！',
        TUTORIAL_DIALOG_MESSAGE: 'これで、実際のバトルチョックの試合をする準備が整いました。今すぐ開始しますか？',
        TUTORIAL_DIALOG_HINT: '設定メニューでチュートリアルを再開できるようになりました',
        TUTORIAL_DIALOG_BACK: 'メニューに戻る',
        TUTORIAL_DIALOG_PLAY_GAME: '試合を開始する',
        TUTORIAL_CHOOSE_NAME_INFO: '始める前に、クールな名前を選択することをお勧めします！友人はあなたの名前に基づいてあなたを簡単に見つけることができ、敵はその名前を聞くと最終的に震えます。',
        ACTIONS: '行動',
        OPPONENT: '相手',
        TURNS: 'ターン',
        MATCH_TIME: '試合時間',
        LAST_ACTION: '最後のアクション',
        POTENTIAL_COINS: '潜在的なコイン',
        RANDOM_OPPONENT: 'ランダムな相手',
        SHARE_LINK: 'リンクを共有する',
        FRIENDS: '友だち',
        START_GAME: 'ゲームを始める',
        JOIN_GAME: 'ゲームに参加します',
        FRIENDS_INFO: 'あなたは今友達がいません',
        ADD_FRIEND: '友達に追加',
        REMOVE_FRIEND: '友達から削除',
        SEARCH_PLAYERS: '検索プレーヤー',
        SEARCH_USER_INFO: 'プレーヤーが見つかりません',
        CHOCLAB_INCREASED_BY: '増加',
        ATTRIBUTE_NAME: attribute => {
            switch (attribute) {
                case 'hp': return '健康ポイント';
                case 'area': return '面積効果';
                case 'buildingsPerTurn': return 'ターンごとの建物';
                case 'cacaoPerTurn': return 'ターンごとのカカオ';
                case 'attack': return '攻撃';
                case 'fortune': return '幸運';
                case 'donutProbability': return 'ドーナツ確率';
                case 'donutTypes': return 'ドーナツの種類';
                default: return 'わからない';
            }
        },
        WARNING_GAME_NOT_JOINABLE: '参加したいゲームは既に終了しています',
        WARNING_PLAYER_NOT_FOUND: name => name + ' 見つかりません',
        SURRENDER: '降伏',
        SURRENDER_GAME: 'サレンダーゲーム',
        SURRENDER_GAME_TEXT: name => '本当にゲームを放棄したいですか ' + name,
        PWA_UPDATE_AVAILABLE: '新しいバージョンが利用可能であり、pwaまたはブラウザを再起動するとすぐに使用されます',
        PWA_OFFLINE_MODE: 'インターネットに接続せずにBattlechocを実行しているため、シングルプレイヤーモードのみが使用可能です',
        PWA_ONLINE_MODE: 'インターネットに再接続しました',
        UPDATE_LEVEL_FAILED: upgrade => '実行することができませんでした ' + (upgrade ? 'アップ' : 'ダウン') + 'グレード。 インターネット接続を確認してください',
        NO_HEALTHY_INTERNET: 'インターネット接続が正常でない可能性があります。後でもう一度やり直してください。',
        SESSION_REFRESH_FAILED: 'マルチプレイヤーセッションの更新に失敗しました。インターネット接続を確認してください。',
        FETCH_HIGHSCORE_FAILED: 'ハイスコ​​アを取得できませんでした。インターネット接続を確認してください。',
        WARNING_GAME_NOT_JOINABLE_VIA_URL: '選択したゲームは既に終了しているか、アカウントに関連付けられていません。',
        ERROR_GAME_NOT_JOINABLE_VIA_URL: 'ゲームを開始できませんでした。インターネット接続を確認してください。',
        TRY_TO_JOIN_GAME: '私たちはあなたをマルチプレイヤーゲームに直接接続しようとします。少々お待ちください。',
        TRY_TO_SHOW_PLAYER_ACCOUNT: 'プレーヤーアカウントを読み込んでいます。しばらくお待ちください',
        NOTIFICATION_PERMISSION_INFO: '誰かがあなたに挑戦したり、対戦相手が彼のターンを終えて、あなたがプレーする準備ができている場合、私たちはあなたにあなたに通知する許可を求めます。',
        NO_ACCOUNT_INFO: '現在ログインしていません。設定メニューにログインするか、メインページで新しいゲームを開始して新しいアカウントを作成します'
    }
};


export default languages;