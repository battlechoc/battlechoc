import { EntityType, AttackType } from 'battlechoc-shared-functions';

const translations = {
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
    TOOLTIP_INITIAL_TURN_OPPONENT_PART: ' can now select a game field.',
    TOOLTIP_BUILDING_TITLE_CREAM: 'Cream',
    TOOLTIP_BUILDING_TITLE_FACTORY_EXTENSION: 'Factory extension',
    TOOLTIP_BUILDING_TITLE_FACTORY: 'Factory',
    TOOLTIP_BUILDING_TITLE_HOT_CHOCOLATE_BALLISTA: 'Hot chocolate ballista',
    TOOLTIP_BUILDING_TITLE_CACAOTREE: 'Cacao tree',
    TOOLTIP_BUILDING_TITLE_RUM_TRUFFLE_CANNON: 'Rum truffle cannon',
    TOOLTIP_BUILDING_TITLE_XMAS_FACTORY: 'X-mas factory',
    TOOLTIP_BUILDING_TITLE_SPYING_EASTER_BUNNY: 'Spying easter bunny',
    TOOLTIP_BUILDING_TITLE_CHOCOLATE_FOUNTAIN: 'Chocolate fountain',
    TOOLTIP_BUILDING_TITLE_FRUIT_CANNON: 'Fruit cannon',
    TOOLTIP_BUILDING_TITLE_DONUT_FACTORY: 'Donut factory',
    TOOLTIP_BUILDING_TITLE_DONUT_PORTAL_RED: 'Red portal donut',
    TOOLTIP_BUILDING_TITLE_DONUT_PORTAL_BLUE: 'Blue portal donut',
    TOOLTIP_BUILDING_TITLE_DONUT_STOP_PINK: 'Pink stop donut',
    TOOLTIP_BUILDING_TITLE_DONUT_SURPRISE_YELLOW: 'Yellow surprise donut',
    TOOLTIP_BUILDING_TITLE_DONUT_HEALTH_GREEN: 'Green health donut',
    TOOLTIP_BUILDING_TITLE_DONUT_CREAM_WHITE: 'White cream donut',
    TOOLTIP_BUILDING_TITLE_UNKNOWN: 'Unknown',
    TOOLTIP_BUILDING_INFO_CREAM: 'Buildings built in cream will be hidden from the enemy. The building order of cream and buildings does not matter.',
    TOOLTIP_BUILDING_INFO_FACTORY_EXTENSION: 'A factory extension can only be placed directly next to your factory.',
    TOOLTIP_BUILDING_INFO_CACAOTREE: 'The cacao tree offers you all the resources you need.',
    TOOLTIP_BUILDING_INFO_RUM_TRUFFLE_CANNON: 'The rum truffle cannon leads you to victory.',
    TOOLTIP_BUILDING_INFO_XMAS_FACTORY: 'The rumor that Easter bunnies are melted down to Santa Clauses is true! If an Easter bunny comes near the Christmas factory, a present is waiting for you.',
    TOOLTIP_BUILDING_INFO_SPYING_EASTER_BUNNY: 'The spying easter bunny can look under the cream of the opponent, but watch out for Christmas factories.',
    TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN: 'The chocolate fountain safes all surrounding buildings from rum truffle cannon attacks.',
    TOOLTIP_BUILDING_INFO_FRUIT_CANNON: 'The fruit cannon destroys creams and chocolate fountains of your enemy.',
    TOOLTIP_BUILDING_INFO_DONUT_FACTORY: 'The donut factory is going to produce donut traps which can be very dangerous to your opponent.',
    TOOLTIP_BUILDING_INFO_DONUT_PORTAL_RED_BLUE: 'If the blue donut is triggered by any attack, a portal will swap the fields and all entities with it\'s corresponding red donut.',
    TOOLTIP_BUILDING_INFO_DONUT_STOP_PINK: 'If the pink donut is triggered by any attack, the opponent attack phase will stop immediately.',
    TOOLTIP_BUILDING_INFO_DONUT_SURPRISE_YELLOW: 'If the yellow donut is triggered by any attack, it will randomly heal it\'s 5x5 area, fill it with cream, or stop the opponent\'s attack phase immediately.',
    TOOLTIP_BUILDING_INFO_DONUT_HEALTH_GREEN: 'If the green donut is triggered by any attack, the 5x5 area around the donut will be fully healed.',
    TOOLTIP_BUILDING_INFO_DONUT_CREAM_WHITE: 'If the white donut is triggered by any attack, the 5x5 area around the donut will be filled with cream.',
    TOOLTIP_BUILDING_INFO_UNKNOWN: 'Unknown building',
    TOOLTIP_BUILDING_COSTS_PART: 'Cacao costs: ',
    TOOLTIP_BUILDING_INFO_BUILDINGS_PER_TURN: 'Buildings per turn +',
    TOOLTIP_BUILDING_INFO_CACAO_PER_TURN: 'Cacao per turn +',
    TOOLTIP_BUILDING_INFO_ATTACKS_PER_TURN: 'Attacks per turn +1',
    TOOLTIP_BUILDING_INFO_SPYING_PER_TURN: 'Spying per turn +1',
    TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN_ADVANTAGE: 'Secures an area of 3x3 cells around the fountain.',
    TOOLTIP_BUILDING_INFO_FRUIT_CANNON_ADVANTAGE: 'Fruit attacks per turn +1',
    TOOLTIP_BUILDING_INFO_DONUT_FACTORY_ADVANTAGE_PART: 'Produces a donut per turn with a probability of ',
    TOOLTIP_INITIAL_PLACEMENT_TITLE: 'Initial Placement',
    TOOLTIP_INITIAL_PLACEMENT_MESSAGE: 'Now you can build the factory once. Set the factory carefully: If it is destroyed, you cannot build any other buildings',
    TOOLTIP_BUILD_PHASE_TITLE: 'Build Phase',
    TOOLTIP_BUILD_PHASE_MESSAGE: 'Choose a building from the list below and build it on any of the free fields. The cream is displayed translucent. A building built in cream will be invisible to the enemy',
    TOOLTIP_ATTACK_PHASE_TITLE: 'Attack Phase',
    TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_TRUFFLE: 'Rum truffle',
    TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_FRUIT: 'Fruit',
    TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_HOT_CHOCOLATE: 'Hot chocolate',
    TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_BUNNY: 'Spying easter bunny',
    TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_UNKNOWN: 'Unknown',
    TOOLTIP_ATTACK_PHASE_MESSAGE: 'Click on an enemy building to destroy it. Hint: Smart enemies hide buildings within cream',
    TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_TRUFFLE: 'Destroys buildings and cream. Can be mitigated by the chocolate fountain shield.',
    TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_FRUIT: 'Destroys creams and the chocolate fountain. Other buildings are not harmed by the fruit cannon.',
    TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_HOT_CHOCOLATE: 'Destroys buildings, creams and even the part of the gamefield that is attacked. Cannot be mitigated by the chocolate fountain shield.',
    TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_BUNNY: 'Reveals all the buildings under creams within a 3x3 region around the attacked cell. Gets caught by X-mas factories in the vincinity.',
    TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_UNKNOWN: 'Unknwon',
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
    WARNING_GAME_NOT_JOINABLE: 'The game you want to join has already ended',
    SURRENDER: 'Surrender',
    SURRENDER_GAME: 'Surrender Game',
    PWA_UPDATE_AVAILABLE: 'A new version is available and will be used as soon as you restart the pwa, or the browser',
    PWA_OFFLINE_MODE: 'You are running battlechoc without internet connection, so only the singleplayer mode is available.',
    PWA_ONLINE_MODE: 'You\'re re-connected to the Internet.',
    NO_HEALTHY_INTERNET: 'You may not have a healthy internet connection. Please try again later.',
    SESSION_REFRESH_FAILED: 'Multiplayer session refresh failed. Please check your internet connection.',
    FETCH_HIGHSCORE_FAILED: 'Failed to fetch highscore. Please check your internet connection.',
    WARNING_GAME_NOT_JOINABLE_VIA_URL: 'The selected game is already ended or not associated with your account.',
    ERROR_GAME_NOT_JOINABLE_VIA_URL: 'Failed to start the game. Please check your internet connection.',
    TRY_TO_JOIN_GAME: 'We try to connect you directly to your multiplayer game. Please wait a moment.',
    TRY_TO_SHOW_PLAYER_ACCOUNT: 'Loading player account. Please wait a moment.',
    NOTIFICATION_PERMISSION_INFO: 'We will now request your permission to inform you if someone challenges you, or an opponent has finished his turn and you are up to play',
    NO_ACCOUNT_INFO: 'You are currently not logged in. Use the settings icon to login or just start a new game on the main page for creating a new one',
    WARNING_PLAYER_NOT_FOUND_PRE_PART: 'Player ',
    WARNING_PLAYER_NOT_FOUND_POST_PART: ' not found',
    SURRENDER_GAME_TEXT_PART: 'Do you really want to surrender the game against ',
    UPDATE_LEVEL_FAILED_UPGRADE: 'It was not possible to perform the upgrade. Check your internet connection.',
    UPDATE_LEVEL_FAILED_DOWNGRADE: 'It was not possible to perform the downgrade. Check your internet connection.',
    ATTRIBUTE_NAME_hp: 'HP',
    ATTRIBUTE_NAME_area: 'Area effect',
    ATTRIBUTE_NAME_buildingsPerTurn: 'Buildings per turn',
    ATTRIBUTE_NAME_cacaoPerTurn: 'Cacao per turn',
    ATTRIBUTE_NAME_attack: 'Attack',
    ATTRIBUTE_NAME_fortune: 'Fortune',
    ATTRIBUTE_NAME_donutProbability: 'Donut probability',
    ATTRIBUTE_NAME_donutTypes: 'Donut types',
    ATTRIBUTE_NAME_UNKNOWN: 'Unknown',
    TOOLTIP_INITIAL_TURN_OPPONENT: function (name) {
        return name + this.TOOLTIP_INITIAL_TURN_OPPONENT_PART;
    },
    TOOLTIP_BUILDING_TITLE: function (type) {
        switch (type) {
            case EntityType.CREAM:
            case EntityType.FACTORY_EXTENSION:
            case EntityType.FACTORY:
            case EntityType.HOT_CHOCOLATE_BALLISTA:
            case EntityType.CACAOTREE:
            case EntityType.RUM_TRUFFLE_CANNON:
            case EntityType.XMAS_FACTORY:
            case EntityType.SPYING_EASTER_BUNNY:
            case EntityType.CHOCOLATE_FOUNTAIN:
            case EntityType.FRUIT_CANNON:
            case EntityType.DONUT_FACTORY:
            case EntityType.DONUT_PORTAL_RED:
            case EntityType.DONUT_PORTAL_BLUE:
            case EntityType.DONUT_STOP_PINK:
            case EntityType.DONUT_SURPRISE_YELLOW:
            case EntityType.DONUT_HEALTH_GREEN:
            case EntityType.DONUT_CREAM_WHITE:
                return this['TOOLTIP_BUILDING_TITLE_' + type.replace('EntityType.', '')];
            default: return this.TOOLTIP_BUILDING_TITLE_UNKNOWN;
        }
    },
    TOOLTIP_BUILDING_INFO: function (type, building) {
        switch (type) {
            case EntityType.CREAM:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_CREAM,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs
                }
            case EntityType.FACTORY_EXTENSION:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_FACTORY_EXTENSION,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_BUILDINGS_PER_TURN + building.buildingsPerTurn
                }
            case EntityType.CACAOTREE:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_CACAOTREE,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_CACAO_PER_TURN + building.cacaoPerTurn
                }
            case EntityType.RUM_TRUFFLE_CANNON:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_RUM_TRUFFLE_CANNON,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_ATTACKS_PER_TURN
                }
            case EntityType.XMAS_FACTORY:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_XMAS_FACTORY,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs
                }
            case EntityType.SPYING_EASTER_BUNNY:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_SPYING_EASTER_BUNNY,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_SPYING_PER_TURN
                }
            case EntityType.CHOCOLATE_FOUNTAIN:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_CHOCOLATE_FOUNTAIN_ADVANTAGE
                }
            case EntityType.FRUIT_CANNON:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_FRUIT_CANNON,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_FRUIT_CANNON_ADVANTAGE
                }
            case EntityType.DONUT_FACTORY:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_FACTORY,
                    costs: this.TOOLTIP_BUILDING_COSTS_PART + building.costs,
                    advantages: this.TOOLTIP_BUILDING_INFO_DONUT_FACTORY_ADVANTAGE_PART + `${building.donutProbability * 100}%`
                }
            case EntityType.DONUT_PORTAL_RED:
            case EntityType.DONUT_PORTAL_BLUE:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_PORTAL_RED_BLUE
                }
            case EntityType.DONUT_CREAM_WHITE:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_CREAM_WHITE
                }
            case EntityType.DONUT_HEALTH_GREEN:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_HEALTH_GREEN
                }
            case EntityType.DONUT_STOP_PINK:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_STOP_PINK
                }
            case EntityType.DONUT_SURPRISE_YELLOW:
                return {
                    info: this.TOOLTIP_BUILDING_INFO_DONUT_SURPRISE_YELLOW
                }
            default: return { info: this.TOOLTIP_BUILDING_INFO_UNKNOWN }
        }
    },
    TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE: function (attackType) {
        switch (attackType) {
            case AttackType.TRUFFLE:
            case AttackType.FRUIT:
            case AttackType.HOT_CHOCOLATE:
            case AttackType.BUNNY:
                return this['TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_' + attackType.replace('AttackType.', '')];
            default: return this.TOOLTIP_ATTACK_PHASE_TITLE_BY_ATTACK_TYPE_UNKNOWN;
        }
    },
    TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE: function (attackType) {
        switch (attackType) {
            case AttackType.TRUFFLE:
            case AttackType.FRUIT:
            case AttackType.HOT_CHOCOLATE:
            case AttackType.BUNNY:
                return this['TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_' + attackType.replace('AttackType.', '')];;
            default: return this.TOOLTIP_ATTACK_PHASE_MESSAGE_BY_ATTACK_TYPE_UNKNOWN;
        }
    },
    ATTRIBUTE_NAME: function (attribute) {
        switch (attribute) {
            case 'hp':
            case 'area':
            case 'buildingsPerTurn':
            case 'cacaoPerTurn':
            case 'attack':
            case 'fortune':
            case 'donutProbability':
            case 'donutTypes':
                return this['ATTRIBUTE_NAME_' + attribute];
            default: return this.ATTRIBUTE_NAME_UNKNOWN;
        }
    },
    WARNING_PLAYER_NOT_FOUND: function (name) {
        return this.WARNING_PLAYER_NOT_FOUND_PRE_PART + name + this.WARNING_PLAYER_NOT_FOUND_PRE_PART
    },
    SURRENDER_GAME_TEXT: function (name) {
        return this.SURRENDER_GAME_TEXT_PART + name
    },
    UPDATE_LEVEL_FAILED: function (upgrade) {
        return upgrade ? this.UPDATE_LEVEL_FAILED_UPGRADE : this.UPDATE_LEVEL_FAILED_DOWNGRADE;
    }
}

export default translations;