// Registers the texts of every language: for the server, which answers each player in their
// own language, and for the tests. The game registers only the language its player reads.

const { registerTranslations } = require('./index');

registerTranslations('de', require('../translations/de_strings.js'));
registerTranslations('ja', require('../translations/ja_strings.js'));
registerTranslations('es', require('../translations/es_strings.js'));
registerTranslations('fr', require('../translations/fr_strings.js'));
registerTranslations('it', require('../translations/it_strings.js'));
registerTranslations('pt', require('../translations/pt_strings.js'));
registerTranslations('vi', require('../translations/vi_strings.js'));

module.exports = require('./index');
