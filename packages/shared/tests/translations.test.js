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