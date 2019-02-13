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
        buildingsPerTurn: 0,
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
        }, 3000);
    }

    simulateChooseFieldDecision() {
        setTimeout(() => {
            let decision = Math.round(Math.random());

            if (decision === 0) {
                this.actions.chooseField(0);
            } else {
                this.actions.chooseField(1);
            }
        }, 3000);
    }

    simulateInitialPlacement() {
        setTimeout(() => {
            console.log('finishTurn')
            this.actions.finishTurn();
        }, 4000);        
    }

    simulateAttackPhase() {
        setTimeout(() => {
            this.actions.finishTurn();
        }, 4000);    
    }

    simulateBuildPhase() {
        setTimeout(() => {
            this.actions.finishBuildPhase();
        }, 4000);   
    }
}

export { PlayerType, createPlayer, Augustus };