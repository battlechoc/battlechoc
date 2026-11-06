const setCurrentLanguage = require('../index').setCurrentLanguage;
const getCurrentLanguage = require('../index').getCurrentLanguage;
const translate = require('../index').translate;
const keys = require('../index').translationKeys;

test('default language should be english', () => {
    expect(getCurrentLanguage()).toBe('en');
});

test('should change current language', () => {
    setCurrentLanguage('de');
    expect(getCurrentLanguage()).toBe('de');
});

test('should not set invalid language', () => {
    const currentLanguage = getCurrentLanguage();
    setCurrentLanguage('invalidln');
    expect(getCurrentLanguage()).toBe(currentLanguage);
});

test('should translate to german', () => {
    setCurrentLanguage('de');
    expect(translate(keys.MESSAGE_DRAW_GAME)).toBe('Unentschieden!');
});

test('should not translate', () => {
    expect(translate(keys.MESSAGE_DRAW_GAME_NOT_EXISTING)).toBe('');
});
const languages = require('../index').languages;
const tableOf = language => require(`../translations/${language}_strings.js`);
const placeholdersOf = text => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();

test('every language has every key of the reference language', () => {
    const reference = Object.keys(tableOf('en'));
    languages.filter(language => language !== 'en').forEach(language => {
        const strings = tableOf(language);
        const missing = reference.filter(key => typeof strings[key] !== 'string' || strings[key].length === 0);
        expect({ language, missing }).toEqual({ language, missing: [] });
    });
});

test('no language has a key the reference language lacks', () => {
    const reference = new Set(Object.keys(tableOf('en')));
    languages.forEach(language => {
        const extra = Object.keys(tableOf(language)).filter(key => !reference.has(key));
        expect({ language, extra }).toEqual({ language, extra: [] });
    });
});

test('every language fills the same placeholders into a text', () => {
    const reference = tableOf('en');
    languages.filter(language => language !== 'en').forEach(language => {
        const strings = tableOf(language);
        const different = Object.keys(reference)
            .filter(key => JSON.stringify(placeholdersOf(reference[key])) !== JSON.stringify(placeholdersOf(strings[key])));
        expect({ language, different }).toEqual({ language, different: [] });
    });
});

test('Japanese and Vietnamese go by their language codes; the old country codes still work', () => {
    const { normalizeLanguage, isValidLanguage } = require('../index');
    expect(languages).toEqual(['en', 'de', 'ja', 'es', 'fr', 'it', 'pt', 'vi']);
    expect(normalizeLanguage('ja-JP')).toBe('ja');
    expect(normalizeLanguage('vi')).toBe('vi');
    expect(normalizeLanguage('jp')).toBe('ja');
    expect(normalizeLanguage('vn')).toBe('vi');
    expect(normalizeLanguage('pt_BR')).toBe('pt');
    expect(normalizeLanguage('DE')).toBe('de');
    expect(normalizeLanguage('sv-SE')).toBeUndefined();
    expect(normalizeLanguage(undefined)).toBeUndefined();
    expect(isValidLanguage('jp')).toBe(true);
    expect(isValidLanguage('xx')).toBe(false);
    // a device that stored "jp" keeps its Japanese
    setCurrentLanguage('jp');
    expect(getCurrentLanguage()).toBe('ja');
    expect(translate(keys.MESSAGE_DRAW_GAME)).toBe(tableOf('ja').MESSAGE_DRAW_GAME);
    setCurrentLanguage('en');
});

test('a text is translated into a given language without switching the current one', () => {
    const { translateIn } = require('../index');
    setCurrentLanguage('en');
    expect(translateIn('de', keys.MESSAGE_DRAW_GAME)).toBe('Unentschieden!');
    expect(translateIn('de', keys.CHALLENGE_HEADLINE, 'Anna')).toContain('Anna');
    expect(getCurrentLanguage()).toBe('en');
});

test('only English is there until a language is registered', () => {
    jest.isolateModules(() => {
        const i18n = require('../i18n');
        expect(i18n.hasTranslations('en')).toBe(true);
        expect(i18n.hasTranslations('de')).toBe(false);
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        i18n.setCurrentLanguage('de');
        expect(i18n.getCurrentLanguage()).toBe('en');
        error.mockRestore();
        i18n.registerTranslations('de', tableOf('de'));
        let switched = false;
        i18n.setCurrentLanguage('de', () => { switched = true; });
        expect(switched).toBe(true);
        expect(i18n.translate(i18n.translationKeys.MESSAGE_DRAW_GAME)).toBe('Unentschieden!');
        expect(() => i18n.registerTranslations('xx', {})).toThrow();
    });
});

test('challenge texts fill in names, codes and seconds', () => {
    setCurrentLanguage('en');
    expect(translate(keys.CHALLENGE_HEADLINE, 'Anna')).toBe('Anna challenges you to a chocolate battle!');
    expect(translate(keys.CHALLENGE_APP_HINT)).toBe('Already playing in the battlechoc app? Copy the code and enter it there:');
    expect(translate(keys.CHALLENGE_CODE_COPIED)).toBe('Code copied');
    expect(translate(keys.CHALLENGE_CODE, 'K7Q2-M9XD')).toBe('Code: K7Q2-M9XD');
    expect(translate(keys.REMATCH_OFFER, 'Ben')).toBe('Ben wants a rematch');
    expect(translate(keys.SECONDS_LEFT, 42)).toBe('42 s left');
    setCurrentLanguage('de');
    expect(translate(keys.CHALLENGE_HEADLINE, 'Anna')).toContain('Anna');
    setCurrentLanguage('en');
});

test('the offline profile names only what still exists (no friends, no invites)', () => {
    setCurrentLanguage('en');
    expect(translate(keys.PROFILE_OFFLINE)).toBe('Offline: your rank comes back as soon as battlechoc reaches its server.');
});
