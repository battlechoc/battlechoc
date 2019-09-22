const calculateDivisor = (finalLevel, start, end) => (finalLevel * Math.log2(2))/Math.log2((end - finalLevel)/start);
const growFunction = (level, finalLevel, start, end) => Math.round(level + start * Math.pow(2, level/calculateDivisor(finalLevel,start,end)));

const AttackType = Object.freeze({
    TRUFFLE: 'AttackType.TRUFFLE',
    FRUIT: 'AttackType.FRUIT',
    HOT_CHOCOLATE: 'AttackType.HOT_CHOCOLATE',
    BUNNY: 'AttackType.BUNNY',
    isInstanceOf: function (attackType) {
        if (attackType === AttackType.TRUFFLE ||
            attackType === AttackType.FRUIT ||
            attackType === AttackType.HOT_CHOCOLATE ||
            attackType === AttackType.BUNNY) {
            return true;
        }
        else {
            return false;
        }
    }
});

const EntityType = Object.freeze({
    CREAM: 'EntityType.CREAM',
    FACTORY: 'EntityType.FACTORY',
    FACTORY_EXTENSION: 'EntityType.FACTORY_EXTENSION',
    CACAOTREE: 'EntityType.CACAOTREE',
    RUM_TRUFFLE_CANNON: 'EntityType.RUM_TRUFFLE_CANNON',
    FRUIT_CANNON: 'EntityType.FRUIT_CANNON',
    SPYING_EASTER_BUNNY: 'EntityType.SPYING_EASTER_BUNNY',
    XMAS_FACTORY: 'EntityType.XMAS_FACTORY',
    HOT_CHOCOLATE_BALLISTA: 'EntityType.HOT_CHOCOLATE_BALLISTA',
    CHOCOLATE_FOUNTAIN: 'EntityType.CHOCOLATE_FOUNTAIN',
    isInstanceOf: function (entityType) {
        if (entityType === EntityType.CREAM ||
            entityType === EntityType.FACTORY ||
            entityType === EntityType.CACAOTREE ||
            entityType === EntityType.RUM_TRUFFLE_CANNON ||
            entityType === EntityType.FACTORY_EXTENSION ||
            entityType === EntityType.SPYING_EASTER_BUNNY ||
            entityType === EntityType.XMAS_FACTORY ||
            entityType === EntityType.HOT_CHOCOLATE_BALLISTA ||
            entityType === EntityType.CHOCOLATE_FOUNTAIN ||
            entityType === EntityType.FRUIT_CANNON)
            return true;
        else
            return false;
    }
});

const generateEntityDescription = (entityType, attributes) => {
    return level => {
        let description = {
            style: [],
            basic: {},
            level: {
                current: { },
                max: { }
            }
        };

        attributes.forEach(attribute => {
            if (attribute.name === 'hp') {
                description.style.push({
                    name: 'hp',
                    color: 'green'
                });
            } else if (attribute.name === 'area') {
                description.style.push({
                    name: 'area',
                    color: 'blue'
                });            
            } else if (attribute.name === 'buildingsPerTurn') {
                description.style.push({
                    name: 'buildingsPerTurn',
                    color: 'blue'
                });            
            } else if (attribute.name === 'cacaoPerTurn') {
                description.style.push({   
                    name: 'cacaoPerTurn',
                    color: 'blue'
                });          
            } else if (attribute.name === 'attack') {
                description.style.push({
                    name: 'attack',
                    color: 'red'
                });
            } else if (attribute.name === 'fortune') {
                description.style.push({   
                    name: 'fortune',
                    color: 'red'
                });
            }

            if (attribute.hasOwnProperty('basic')) {
                description.basic[attribute.name] = attribute.basic;
            }

            if (attribute.hasOwnProperty('level')) {
                description.level.current[attribute.name] = level[entityType][attribute.name];


                if (attribute.level.hasOwnProperty("max")) {
                    description.level.max[attribute.name] = attribute.level.max;
                }
            }

            if (attribute.hasOwnProperty('custom')) {
                description[attribute.name] = attribute.custom;
            } else if (attribute.hasOwnProperty('grow') && attribute.hasOwnProperty('level')) {
                description[attribute.name] = function() {
                    return [
                        growFunction(
                            this.level.current[attribute.name], 
                            this.level.max[attribute.name], 
                            this.basic[attribute.name], attribute.grow),
                        growFunction(
                            this.level.max[attribute.name], 
                            this.level.max[attribute.name], 
                            this.basic[attribute.name], attribute.grow)
                    ]
                }
            }

            if (entityType === EntityType.RUM_TRUFFLE_CANNON) {
                description.attackType = () => AttackType.TRUFFLE;
                description.attacksPerTurn = () => 1;
            } else if (entityType === EntityType.HOT_CHOCOLATE_BALLISTA) {
                description.attackType = () => AttackType.HOT_CHOCOLATE;
                description.attacksPerTurn = () => 1;                
            } else if (entityType === EntityType.FRUIT_CANNON) {
                description.attackType = () => AttackType.FRUIT;
                description.attacksPerTurn = () => 1;                
            } else if (entityType === EntityType.SPYING_EASTER_BUNNY) {
                description.attackType = () => AttackType.BUNNY;
                description.attacksPerTurn = () => 1;                     
            }
        });
        return description;
    }
}

const EntityDescriptors = Object.freeze(new Map([
    [EntityType.CREAM, generateEntityDescription(EntityType.CREAM, [{
            name: 'hp',
            custom: function () { return [1, 1] }
        }, {
            name: 'area',
            basic: 1,
            level: { max: 2 },
            custom: function() { return [
                this.basic.area + 2 * this.level.current.area,
                this.basic.area + 2 * this.level.max.area
            ]},
        }, {
            name: 'costs',
            basic: 10,
            custom: function() { return Math.pow(this.area()[0], 2) * this.basic.costs }
        }, {
            name: 'coins',
            custom: function() {
                return growFunction(
                    this.level.current.area, 
                    this.level.max.area, 
                    240, 25120)
            }
        }
    ])],
    [EntityType.FACTORY, generateEntityDescription(EntityType.FACTORY, [{
            name: 'hp',
            basic: 48,
            level: { max: 15 },
            grow: 3092
        }, {
            name: 'buildingsPerTurn',
            basic: 2,
            level: { max: 4 },
            custom: function() { 
                return [
                    this.level.current.buildingsPerTurn + 2,
                    this.level.max.buildingsPerTurn + 2
                ]
            }
        }, {
            name: 'cacaoPerTurn',
            basic: 15,
            level: { max: 10 },
            grow: 1020
        }, {
            name: 'costs',
            basic: 0,
            custom: function() { 
                return 0;               
            }
        }, {
            name: 'coins',
            custom: function() { 
                return (
                    this.hp()[0] +
                    this.cacaoPerTurn()[0] + 
                    (this.level.current.buildingsPerTurn * 4096)
                );
            }
        }
    ])],
    [EntityType.FACTORY_EXTENSION, generateEntityDescription(EntityType.FACTORY_EXTENSION, [{
            name: 'hp',
            basic: 48,
            level: { max: 15 },
            grow: 3092
        }, {
            name: 'buildingsPerTurn',
            basic: 2,
            level: { max: 4 },
            custom: function() { 
                return [
                    this.level.current.buildingsPerTurn + 2,
                    this.level.max.buildingsPerTurn + 2
                ]
            }
        }, {
            name: 'costs',
            basic: 120,
            custom: function() { 
                let level = this.level.current.buildingsPerTurn +
                            this.level.current.hp;

                let maxLevel = this.level.max.buildingsPerTurn +
                               this.level.max.hp;                               
                return growFunction(
                    level, 
                    maxLevel, 
                    this.basic.costs, 11302)                 
            }
        }, {
            name: 'coins',
            custom: function() { 
                return (
                    this.hp()[0] + 
                    (this.level.current.buildingsPerTurn * 4096) + 
                    this.costs()
                );
            }
        }
    ])],
    [EntityType.CACAOTREE, generateEntityDescription(EntityType.CACAOTREE, [{
            name: 'hp',
            basic: 12,
            level: { max: 15 },
            grow: 1320
        }, {
            name: 'cacaoPerTurn',
            basic: 30,
            level: { max: 20 },
            grow: 7606
        }, {
            name: 'coins',
            custom: function() { 
                return (
                    this.hp()[0] +
                    this.cacaoPerTurn()[0] +
                    this.costs()
                );
            },
        }, {
            name: 'costs',
            basic: 20,
            custom: function() { 
                let level = this.level.current.cacaoPerTurn +
                            this.level.current.hp;

                let maxLevel = this.level.max.cacaoPerTurn +
                               this.level.max.hp;                               
                return growFunction(
                    level, 
                    maxLevel, 
                    this.basic.costs, 4800)                 
            }
        } 
    ])],
    [EntityType.RUM_TRUFFLE_CANNON, generateEntityDescription(EntityType.RUM_TRUFFLE_CANNON, [{
            name: 'hp',
            basic: 33,
            level: { max: 15 },
            grow: 13040
        }, {
            name: 'attack',
            basic: 27,
            level: { max: 20 },
            grow: 6606
        }, {
            name: 'area',
            basic: 1,
            level: { max: 2 },
            custom: function() { return [
                this.basic.area + 2 * this.level.current.area,
                this.basic.area + 2 * this.level.max.area
            ]}
        }, {
            name: 'coins',
            custom: function() { 
                return (
                    this.hp()[0] +
                    this.attack()[0] +
                    this.level.current.area * 5680 +
                    this.costs()
                );
            }
        }, {
            name: 'costs',
            basic: 40,
            custom: function() { 
                let level = this.level.current.attack +
                            this.level.current.area * 20 +
                            this.level.current.hp;

                let maxLevel = this.level.max.attack +
                               this.level.max.area * 20 +
                               this.level.max.hp;                               
                return growFunction(
                    level, 
                    maxLevel, 
                    this.basic.costs, 69005)
            }
        }
    ])],
    [EntityType.FRUIT_CANNON, generateEntityDescription(EntityType.FRUIT_CANNON, [{
            name: 'hp',
            basic: 33,
            level: { max: 15 },
            grow: 13040
        }, {
            name: 'attack',
            basic: 56,
            level: { max: 20 },
            grow: 7606
        }, {
            name: 'area',
            basic: 1,
            level: { max: 2 },
            custom: function() { return [
                this.basic.area + 2 * this.level.current.area,
                this.basic.area + 2 * this.level.max.area
            ]}
        }, {
            name: 'coins',
            custom: function() { 
                return (
                    this.hp()[0] +
                    this.attack()[0] +
                    this.level.current.area * 5680 +
                    this.costs()
                );
            }
        }, {
            name: 'costs',
            basic: 40,
            custom: function() { 
                let level = this.level.current.attack +
                            this.level.current.area * 20 +
                            this.level.current.hp;

                let maxLevel = this.level.max.attack +
                               this.level.max.area * 20 +
                               this.level.max.hp;                               
                return growFunction(
                    level, 
                    maxLevel, 
                    this.basic.costs, 69005)
            }
        }
    ])],
    [EntityType.SPYING_EASTER_BUNNY, generateEntityDescription(EntityType.SPYING_EASTER_BUNNY, [{
            name: 'hp',
            basic: 46,
            level: { max: 10 },
            grow: 2198
        }, {
            name: 'fortune',
            basic: 1,
            level: { max: 3 },
            custom: function() { return [
                this.basic.fortune + 3 * this.level.current.fortune,
                this.basic.fortune + 3 * this.level.max.fortune
            ]}
        }, {
            name: 'area',
            basic: 3,
            level: { max: 1 },
            custom: function() { return [
                this.basic.area + 2 * this.level.current.area,
                this.basic.area + 2 * this.level.max.area
            ]}
        }, {
            name: 'coins',
            custom: function() { 
                return (
                    this.hp()[0] +
                    this.level.current.fortune * 5680 +
                    this.level.current.area * 5680 +
                    this.costs()
                );
            }
        }, {
            name: 'costs',
            basic: 120,
            custom: function() { 
                let level = this.level.current.fortune * 20 +
                            this.level.current.area * 20 +
                            this.level.current.hp;

                let maxLevel = this.level.max.fortune * 20 +
                               this.level.max.area * 20 +
                               this.level.max.hp;                               
                return growFunction(
                    level, 
                    maxLevel, 
                    this.basic.costs, 41000)                 
            }
        }
    ])],
    [EntityType.XMAS_FACTORY, generateEntityDescription(EntityType.XMAS_FACTORY, [{
            name: 'hp',
            basic: 46,
            level: { max: 10 },
            grow: 5012
        }, {
            name: 'area',
            basic: 3,
            level: { max: 1 },
            custom: function() { return [
                this.basic.area + 2 * this.level.current.area,
                this.basic.area + 2 * this.level.max.area
            ]}
        }, {
            name: 'coins',
            custom: function() { 
                return (
                    this.hp()[0] +
                    this.level.current.area * 5680 +
                    this.costs()
                );
            },
        }, {
            name: 'costs',
            basic: 80,
            custom: function() { 
                let level = this.level.current.area * 20 +
                            this.level.current.hp;

                let maxLevel = this.level.max.area * 20 +
                               this.level.max.hp;                               
                return growFunction(
                    level, 
                    maxLevel, 
                    this.basic.costs, 41000)                 
            }   
        }
    ])],
    [EntityType.HOT_CHOCOLATE_BALLISTA, generateEntityDescription(EntityType.HOT_CHOCOLATE_BALLISTA, [{
            name: 'hp',
            basic: 123,
            level: { max: 10 },
            grow: 5012
        }, {
            name: 'fortune',
            basic: 5,
            level: { max: 4 },
            custom: function() { return [
                this.basic.fortune + 5 * this.level.current.fortune,
                this.basic.fortune + 5 * this.level.max.fortune
            ]}
        }, {
            name: 'area',
            basic: 1,
            level: { max: 2 },
            custom: function() { return [
                this.basic.area + 2 * this.level.current.area,
                this.basic.area + 2 * this.level.max.area
            ]}
        }, {
            name: 'coins',
            custom: function() { 
                return (
                    this.hp()[0] +
                    this.level.current.area * 13480 +
                    this.level.current.fortune * 17630
                );
            }
        }, {
            name: 'costs',
            basic: 0,
            custom: function() {                        
                return this.basic.costs;              
            }
        }
    ])],
    [EntityType.CHOCOLATE_FOUNTAIN, generateEntityDescription(EntityType.CHOCOLATE_FOUNTAIN, [{
            name: 'hp',
            basic: 198,
            level: { max: 15 },
            grow: 32012
        }, {
            name: 'coins',
            custom: function() { 
                return Math.round(this.hp()[0] * 1.3); 
            }
        }, {
            name: 'costs',
            basic: 120,
            custom: function() {                            
                return growFunction(
                    this.level.current.hp, 
                    this.level.max.hp, 
                    this.basic.costs, 212000)                 
            }   
        }
    ])]
]));

module.exports = {
    calculateCosts: (entity, level) => {
        if (!EntityDescriptors.has(entity)) {
            throw new Error("Invalid entity type given: " + entity);
        } else {
            return EntityDescriptors.get(entity)(level).coins();
        }
    },
    getMaximumLevel: (entity, level, attribute) => {
        if (!EntityDescriptors.has(entity)) {
            throw new Error("Invalid entity type given: " + entity);
        } else {
            return EntityDescriptors.get(entity)(level).level.max[attribute];
        }
    }
}