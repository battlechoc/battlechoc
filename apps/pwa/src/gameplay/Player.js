import uuidv4 from 'uuid/v4';

const PlayerType = Object.freeze({
    HUMAN: 'PlayerType.HUMAN',
    AUGUSTUS_GLOOP: 'PlayerType.AUGUSTUS_GLOOP'
});

function createPlayer(name, type, activePlayer) {
    return { 
        name: name, 
        type: type, 
        id: uuidv4(),
        cacao: 50,
        cacaoPerTurn: 0,
        buildings: 0,
        buildingsPerTurn: 2,
        attacks: 0,
        attacksPerTurn: 0
    };
}

class Augustus {
    constructor(actions) {
        this.actions = actions;
    }

    simulateChooseFieldOrStartDecision() {
        setTimeout(() => {
            let decision = Math.floor(Math.random() * 3);

            if (decision === 0) {
                this.actions.chooseStart();
            } else if (decision === 1) {
                this.actions.chooseField(0);
            } else {
                this.actions.chooseField(1);
            }
        }, 2000);
    }

    simulateChooseFieldDecision() {
        setTimeout(() => {
            let decision = Math.round(Math.random());

            if (decision === 0) {
                this.actions.chooseField(0);
            } else {
                this.actions.chooseField(1);
            }
        }, 2000);
    }
}

export { PlayerType, createPlayer, Augustus };