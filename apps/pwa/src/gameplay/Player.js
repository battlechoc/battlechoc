import uuidv4 from 'uuid/v4';

const PlayerType = Object.freeze({
    human: 'human',
    non_human: 'non_human'
});

function createPlayer(name, type) {
    return { name: name, type: type, id: uuidv4() };
}

export { PlayerType, createPlayer };