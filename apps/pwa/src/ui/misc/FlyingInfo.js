const InfoType = Object.freeze({
    CACAO_HARVESTED: 'InfoType.CACAO_HARVESTED',
    CACAO_CONSUMED: 'InfoType.CACAO_CONSUMED',
    INCREASE_BUILDINGS_PER_TURN: 'InfoType.INCREASE_BUILDINGS_PER_TURN',
    INCREASE_CACAO_PER_TURN: 'InfoType.INCREASE_CACAO_PER_TURN',
    INCREASE_ATTACKS_PER_TURN: 'InfoType.INCREASE_ATTACKS_PER_TURN',
    INCREASE_SPY_ATTACKS_PER_TURN: 'InfoType.INCREASE_SPY_ATTACKS_PER_TURN',
    BUNNY_CAUGHT: 'InfoType.BUNNY_CAUGHT'
});

function spawnInfo(message) {
    let info = document.createElement("div");

    if (message.type === InfoType.CACAO_HARVESTED) {
        info.innerHTML = '<p>+' + message.cacao + '</p><img src="/images/cacao_no_background.png" />';
        info.classList.add('flyingInfo', 'positive');
    } else if (message.type === InfoType.CACAO_CONSUMED) {
        info.innerHTML = '<p>-' + message.cacao + '</p><img src="/images/cacao_no_background.png" />';
        info.classList.add('flyingInfo', 'negative');
    } else if (message.type === InfoType.INCREASE_CACAO_PER_TURN) {
        info.innerHTML = '<p>+' + message.cacao + '</p><img src="/images/cacaoPerTurn.png" />';
        info.classList.add('flyingInfo', 'positive');
    } else if (message.type === InfoType.INCREASE_BUILDINGS_PER_TURN) {
        info.innerHTML = '<p>+' + message.buildings + '</p><img src="/images/buildingsPerTurn.png" />';
        info.classList.add('flyingInfo', 'positive');
    } else if (message.type === InfoType.INCREASE_ATTACKS_PER_TURN) {
        info.innerHTML = '<p>+' + message.attacks + '</p><img src="/images/attacksPerTurn.png" />';
        info.classList.add('flyingInfo', 'positive');
    } else if (message.type === InfoType.INCREASE_SPY_ATTACKS_PER_TURN) {
        info.innerHTML = '<p>+' + message.attacks + '</p><img src="/images/spyAttacksPerTurn.png" />';
        info.classList.add('flyingInfo', 'positive');
    } else if (message.type === InfoType.BUNNY_CAUGHT) {
        info.innerHTML = '<img src="/images/bunnyCaught.png" />';
        info.classList.add('flyingCaughtBunny');
    }

    let container = document.getElementsByClassName('app')[0];
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    let ratio = width / height;

    if (ratio < 1.1) {
        info.style.top = (message.y - Math.round(window.innerHeight * 0.07)) + "px";
        info.style.left = (message.x - Math.round(window.innerWidth * 0.015)) + "px";
    }
    else if (ratio < 1.4) {
        info.style.top = (message.y - Math.round(window.innerHeight * 0.1)) + "px";
        info.style.left = (message.x - Math.round(window.innerWidth * 0.015)) + "px";
    }
    else {
        info.style.top = (message.y - Math.round(window.innerHeight * 0.12)) + "px";
        info.style.left = (message.x - Math.round(window.innerWidth * 0.01)) + "px";
    }

    let animations = {
        "animation": "animationend",
        "OAnimation": "oAnimationEnd",
        "MozAnimation": "animationend",
        "WebkitAnimation": "webkitAnimationEnd"
    }
    let supportedAnimation = 'animation';

    for (let animation in animations) {
        if (typeof info.style[animation] !== 'undefined') {
            supportedAnimation = animations[animation];
        }
    }

    info.addEventListener(supportedAnimation, () => {
        container.removeChild(info);
    });

    container.appendChild(info);
}

export {InfoType, spawnInfo};