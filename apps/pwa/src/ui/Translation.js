const languages = {
	en: {
		NEW_GAME: 'New Game',
		SETTINGS: 'Settings',
		GERMAN: 'German',
		ENGLISH: 'English',
		LANGUAGE: 'Language',
		BUTTON_BACK: 'Back',
		TOOLTIP_INITIAL_TURN_TITLE: 'Initial Turn',
		TOOLTIP_INITIAL_TURN_MESSAGE: 'In the first round you can choose a playing field or the first move',
		TOOLTIP_INITIAL_TURN_OPPONENT: name => name + ' can now select a game field',
		TOOLTIP_INITIAL_PLACEMENT_TITLE: 'Initial Placement',
		TOOLTIP_INITIAL_PLACEMENT_MESSAGE: 'Now you can build the factory once. Set the factory carefully: If it is destroyed, you cannot build any other buildings',
		TOOLTIP_BUILD_PHASE_TITLE: 'Build Phase',
		TOOLTIP_BUILD_PHASE_MESSAGE: 'Choose a building from the list below and build it on any of the free fields. The cream is displayed translucent. A building built in cream will be invisible to the enemy',
		MESSAGE_PLAYER_DECIDE: 'It\'s up on you',
		MESSAGE_OPPONENT_DECIDE: 'Your opponent decides'
	},
	de: {
		NEW_GAME: 'Neues Spiel',
		SETTINGS: 'Einstellungen',
		GERMAN: 'Deutsch',
		ENGLISH: 'Englisch',
		LANGUAGE: 'Sprache',
		BUTTON_BACK: 'Zurück',
		TOOLTIP_INITIAL_TURN_TITLE: 'Erste Runde',
		TOOLTIP_INITIAL_TURN_MESSAGE: 'In der ersten Runde kannst du dich für eines der Spielfelder, oder den ersten Zug entscheiden',
		TOOLTIP_INITIAL_TURN_OPPONENT: name => name + ' kann nun ein Spielfeld aussuchen',
		TOOLTIP_INITIAL_PLACEMENT_TITLE: 'Erste Bauphase',
		TOOLTIP_INITIAL_PLACEMENT_MESSAGE: 'In der ersten Bauphase kannst du einmalig die Fabrik setzen. Überlege daher gut: Ist die Fabrik zerstört kannst du keine weiteren Gebäude bauen',
		TOOLTIP_BUILD_PHASE_TITLE: 'Bauphase',
		TOOLTIP_BUILD_PHASE_MESSAGE: 'Wähle ein Gebäude aus der unteren Symbolleiste aus und plaziere es. Sahne ist durchsichtig dargestellt. Ein Gebäude, dass in Sahne gebaut wird ist unsichtbar für den Gegner',
		MESSAGE_PLAYER_DECIDE: 'Entscheide dich jetzt!',
		MESSAGE_OPPONENT_DECIDE: 'Dein Gegner entscheidet'
	}
};

export default languages;