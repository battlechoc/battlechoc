const { uniqueNamesGenerator, adjectives, names, animals } = require('unique-names-generator');
const { EmptyPlayerStats } = require('@battlechoc/battlechoc-shared-functions');

const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{2,24}$/;

const isValidUsername = username => typeof username === 'string' &&
    USERNAME_PATTERN.test(username) &&
    username.toUpperCase() !== EmptyPlayerStats.username.toUpperCase();

const randomName = () => uniqueNamesGenerator({
    dictionaries: [adjectives, names, animals],
    separator: '',
    length: 3,
    style: 'capital',
});

module.exports = { isValidUsername, randomName, USERNAME_PATTERN };
