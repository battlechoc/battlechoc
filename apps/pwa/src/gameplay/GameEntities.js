import uuidv4 from 'uuid/v4';
import { EmptyPlayerStats } from '../Multiplayer';

const BoardCellTypes = Object.freeze({
    WHITE: 'BoardCellTypes.WHITE',
    BROWN: 'BoardCellTypes.BROWN',
    BLACK: 'BoardCellTypes.BLACK'
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

class Board {
    static generate(size, seed) {
        let playerFields = [];
        for (let player = 0; player < 2; player++) {
            let field = { grid: [] };
            for (let row = 0; row < size.rows; row++) {
                for (let col = 0; col < size.cols; col++) {
                    let fieldtype = Math.floor(Math.random() * 6);
                    let creamed = Math.random() < 0.7
                    let cellType = BoardCellTypes.BROWN;
                    let previewStyle = 'brown';

                    if (fieldtype === 0) {
                        cellType = BoardCellTypes.WHITE;
                        previewStyle = 'white';
                    } else if (fieldtype === 1) {
                        cellType = BoardCellTypes.BLACK;
                        previewStyle = 'black';
                    }

                    field.grid.push({
                        type: cellType,
                        previewStyle: previewStyle,
                        row: row,
                        col: col,
                        occupiedBy: creamed ? [createEntity(EntityType.CREAM)] : [],
                        molten: false,
                        shielded: false
                    });
                }
            }
            playerFields.push(field);
        }
        return { fields: playerFields, size: size, seed: seed };
    }
}

const calculateDivisor = (finalLevel, start, end) => (finalLevel * Math.log2(2))/Math.log2((end - finalLevel)/start);
const growFunction = (level, finalLevel, start, end) => Math.round(level + start * Math.pow(2, level/calculateDivisor(finalLevel,start,end)));

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
                    color: 'green',
                    displayName: 'Hp'
                });
            } else if (attribute.name === 'area') {
                description.style.push({
                    name: 'area',
                    color: 'blue',
                    displayName: 'Area Effect'
                });            
            } else if (attribute.name === 'buildingsPerTurn') {
                description.style.push({
                    name: 'buildingsPerTurn',
                    color: 'blue',
                    displayName: 'Buildings per turn'
                });            
            } else if (attribute.name === 'cacaoPerTurn') {
                description.style.push({   
                    name: 'cacaoPerTurn',
                    color: 'blue',
                    displayName: 'Cacao per turn'
                });          
            } else if (attribute.name === 'attack') {
                description.style.push({
                    name: 'attack',
                    color: 'red',
                    displayName: 'Attack'
                });
            } else if (attribute.name === 'fortune') {
                description.style.push({   
                    name: 'fortune',
                    color: 'red',
                    displayName: 'Fortune'
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
                    
                    console.log(this.level.current[attribute.name],this.level.max[attribute.name],
                        this.basic[attribute.name], attribute.grow)

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
                    this.level.current, 
                    this.level.max, 
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
                    this.area()[0] * 5680 +
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
                    this.area()[0] * 5680 +
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
                    this.fortune()[0] * 5680 +
                    this.area()[0] * 5680 +
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
                    this.area()[0] * 5680 +
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
                    this.area()[0] * 13480 +
                    this.fortune()[0] * 17630 +
                    this.costs()
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
            basic: 560,
            level: { max: 15 },
            grow: 32012
        }, {
            name: 'coins',
            custom: function() { 
                return this.hp()[0] * 1.3; 
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

function createEntity(entityType, level) {
    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        let entity = {
            id: uuidv4(),
            type: entityType
        };
        const descriptor = EntityDescriptors.get(entityType)(level);
        for (let field in descriptor) {
            if (['hp','area','buildingsPerTurn','cacaoPerTurn','attack','fortune','costs','coins'].includes(field)) {
                let values = descriptor[field]();
                if (Array.isArray(values)) {
                    entity[field] = values[0];
                } else {
                    entity[field] = values;
                }
            }
        };
        return entity;
    }
}

function getEntityDescriptor(entityType, level) {
    if (typeof level === 'undefined') {
        level = EmptyPlayerStats.level;
    }

    if (!EntityDescriptors.has(entityType)) {
        throw new Error("Invalid entity type given: " + entityType);
    } else {
        return EntityDescriptors.get(entityType)(level);
    }
}

function getCheapest() {
    return getEntityDescriptor(EntityType.CREAM);
}

export { BoardCellTypes, Board, EntityType, AttackType, EntityDescriptors, createEntity, getEntityDescriptor, getCheapest };