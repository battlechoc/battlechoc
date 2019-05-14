import { EntityType, AttackType } from '../gameplay/GameEntities';

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
        INVITATION: 'Join my battlechoc multiplayer game!',
        TOOLTIP_INITIAL_TURN_TITLE: 'Initial Turn',
        TOOLTIP_INITIAL_TURN_MESSAGE: 'In the first round you can choose a playing field or the first move',
        TOOLTIP_INITIAL_TURN_OPPONENT: name => name + ' can now select a game field',
        TOOLTIP_BUILDING_TITLE: (type) => {
            switch (type) {
                case EntityType.CREAM: return 'Cream';
                case EntityType.FACTORY_EXTENSION: return 'Factory extension';
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
        REPORT_CUSTOM_MESSAGE_PLACEHOLDER: 'The problem occurs when you ...',
        REPORT_DEVICE_INFO: 'Add device information',
        REPORT_PROBLEM: 'Report Problem',
        SNACKBAR_ERROR: 'Error sending the problem report. Check your Internet connection',
        SNACKBAR_SEND: 'The problem report was sent successfully!',
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
        IOS_MESSAGE: 'To play battlechoc in fullscreen mode on iOS you need to rotate your iPhone [0] or use the share icon [1] and select [2] "Add to Home Screen"'
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
        INVITATION: 'Spiel mit mir battlechoc!',
        TOOLTIP_INITIAL_TURN_TITLE: 'Erste Runde',
        TOOLTIP_INITIAL_TURN_MESSAGE: 'In der ersten Runde kannst du dich für eines der Spielfelder, oder den ersten Zug entscheiden',
        TOOLTIP_INITIAL_TURN_OPPONENT: name => name + ' kann nun ein Spielfeld aussuchen',
        TOOLTIP_BUILDING_TITLE: (type) => {
            switch (type) {
                case EntityType.CREAM: return 'Sahne';
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
        REPORT_CUSTOM_MESSAGE_PLACEHOLDER: 'Das Problem tritt auf, wenn du ...',
        REPORT_PROBLEM: 'Problembericht senden',
        REPORT_DEVICE_INFO: 'Geräteinformationen anhängen',
        SNACKBAR_ERROR: 'Fehler beim Senden des Problemberichts. Prüfe deine Internetverbindung',
        SNACKBAR_SEND: 'Der Problembericht wurde erfolgreich gesendet!',
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
        IOS_MESSAGE: 'Drehe dein iPhone, um battlechoc im Vollbildmodus spielen zu können [0] oder verwende die Share-Funktion [1] und klicke auf [2] "Zum Home-Bildschirm"'
    }
};


export default languages;