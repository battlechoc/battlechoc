import React, { useState, useEffect, useRef, useCallback, useImperativeHandle } from 'react';
import { connect } from 'react-redux';
import { multiplayer } from '../Multiplayer';
import { deselectBuildings, selectAttack, deselectAttack, selectBuilding, tapBuilding } from '../ui/UiActions';
import { InfoType, build, attack, finishTurn, finishBuildPhase } from '../gameplay/GameActions';
import Gamefield from './Gamefield';
import { GameStateTypes, playerHasAttacks, BattlechocError, EntityType, AttackType, BoardCellTypes, createEntity, getEntityDescriptor, getCheapest, isDonut } from 'battlechoc-shared-functions';
import { Jukebox } from '../ui/misc';
import { Scene as BabylonScene, DynamicTexture, Mesh, StandardMaterial, DirectionalLight, Engine, HighlightLayer, FlyCamera, Color3, Camera, Vector3, HemisphericLight, Color4, Animation, MeshBuilder } from 'babylonjs';
import { AssetLoadingViewContainer as AssetLoadingView } from '../AssetLoader';
import 'babylonjs-loaders';
import logger from '../helper/logger';
import uuidv4 from 'uuid/v4';
import { useTheme } from 'react-jss';

const Scene = props => {
    const scene = useRef();
    const engine = useRef();
    const camera = useRef();
    const container = useRef();
    const playerGameField = useRef(null);
    const renderLoopRepetitions = useRef(0);
    const opponentGameFieldDistance = useRef(12);
    const opponentGameField = useRef(null);
    const loadingView = useRef();
    const highlightLayer = useRef();
    const animations = useRef([]);
    const animate = useRef();
    const energyBars = useRef([]);
    const lookAtOpponent = useRef();
    const theme = useTheme();

    const { customRef, selectedAttack, tutorial, game, selectedBuilding, build, selectBuilding, deselectBuildings, tapBuilding, selectAttack, deselectAttack, finishTurn, finishBuildPhase } = props;

    const estimateOrthographicSize = useCallback(() => {
        const width = container.current.clientWidth;
        const height = container.current.clientHeight;
        const ratio = width / height;
        let distance = Math.max(7.5 / ratio, 5);

        if (tutorial) {
            distance = Math.max(3 / ratio, 5);
        } else if (typeof game !== 'undefined') {
            if (game.board.size.cols === 6) {
                distance = Math.max(4.5 / ratio, 5);
            } else if (game.board.size.cols === 8) {
                distance = Math.max(6 / ratio, 5);
            }
        }

        camera.current.orthoTop = distance;
        camera.current.orthoBottom = - distance;
        camera.current.orthoLeft = - distance * ratio;
        camera.current.orthoRight = distance * ratio;
    }, [game, tutorial]);

    const resize = useCallback(() => {
        estimateOrthographicSize();
        engine.current.resize();
        scene.current.render();
    }, [estimateOrthographicSize]);

    const performCameraFlight = useCallback(() => {
        setRenderLoop();
        let target = new Vector3(30, 30, 30);
        if (lookAtOpponent.current) {
            target = new Vector3(6, 18, 30);
        }
        const flight = new Animation("animCam", "position", 30, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CYCLE);
        const keyframes = [{ frame: 0, value: camera.current.position }, { frame: 30, value: target }];
        flight.setKeys(keyframes);
        scene.current.beginDirectAnimation(camera.current, [flight], 0, 60, false, 1, () => setRenderLoop(false));
    }, []);

    useImperativeHandle(customRef, () => ({
        playerGameField: playerGameField.current,
        clear: () => {
            const instances = scene.current.meshes.filter(mesh => mesh.isAnInstance);
            for (const instance of instances) {
                instance.dispose();
            }
            playerGameField.current = null;
            opponentGameField.current = null;
            scene.current.render();
            camera.current.position = new Vector3(30, 30, 30);
            lookAtOpponent.current = undefined;
        },
        startGame: startGame,
        stopAllAnimations: () => {
            for (const callback of animations.current) {
                scene.current.stopAnimation(callback.target);
            }
    
            if (opponentGameField.current) {
                opponentGameField.current.stopAllAnimations();
            }
    
            if (playerGameField.current) {
                playerGameField.current.stopAllAnimations();
            }
    
            animations.current = [];
        },
        triggerCacaoInfo: () => {
            const cells = game.board.fields[game.players[multiplayer.localPlayerIndex].fieldIndex].grid;
            const entities = cells.filter(cell => cell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM).length > 0)
            entities.forEach(cell => showEnergyBar(cell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM)[0], new Vector3(cell.row, 0, cell.col)))
    
            const trees = cells.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CACAOTREE));
            let description = getEntityDescriptor(EntityType.CACAOTREE, game.players[multiplayer.localPlayerIndex].level);
            trees.forEach(cell => {
                spawnInfo(InfoType.CACAO_HARVESTED, new Vector3(cell.row, 0, cell.col), cell.type === BoardCellTypes.WHITE ? Math.round(description.cacaoPerTurn * 1.5) : description.cacaoPerTurn);
            });
            const factory = cells.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.FACTORY));
            description = getEntityDescriptor(EntityType.FACTORY, game.players[multiplayer.localPlayerIndex].level);
            factory.forEach(cell => {
                spawnInfo(InfoType.CACAO_HARVESTED, new Vector3(cell.row, 0, cell.col), description.cacaoPerTurn);
            });
        },
        highlightCannons: (highlight = true) => {
            const parent = scene.current.getMeshByName(EntityType.RUM_TRUFFLE_CANNON + '__root__');
            const children = parent.getChildren()[0].getChildren().length > 0 ? parent.getChildren()[0].getChildren() : parent.getChildren();
            children.forEach(child => {
                if (highlight) {
                    highlightLayer.current.addMesh(child, new Color3(1, 1, 0));
                } else {
                    highlightLayer.current.removeMesh(child);
                }
            });
            scene.current.render();
        },
        highlightDonuts: (highlight = true) => {
            const highlights = [
                { type: EntityType.DONUT_PORTAL_BLUE, color: new Color3(0.3, 0.3, 1) },
                { type: EntityType.DONUT_PORTAL_RED, color: new Color3(1, 0.3, 0.3) },
                { type: EntityType.DONUT_CREAM_WHITE, color: new Color3(0.9, 0.9, 0.9) },
                { type: EntityType.DONUT_SURPRISE_YELLOW, color: new Color3(1, 1, 0.3) },
                { type: EntityType.DONUT_HEALTH_GREEN, color: new Color3(0.3, 1, 0.3) },
                { type: EntityType.DONUT_STOP_PINK, color: new Color3(1, 0.41, 0.7) }
            ]
    
            for (const entity of highlights) {
                const parent = scene.current.getMeshByName(entity.type + '__root__');
                const children = parent.getChildren()[0].getChildren().length > 0 ? parent.getChildren()[0].getChildren() : parent.getChildren();
    
                for (const child of children) {
                    if (highlight) {
                        highlightLayer.current.addMesh(child, entity.color);
                    } else {
                        highlightLayer.current.removeMesh(child);
                    }
                }
            }
    
            const entities = [
                EntityType.CREAM,
                EntityType.FACTORY,
                EntityType.FACTORY_EXTENSION,
                EntityType.CACAOTREE,
                EntityType.RUM_TRUFFLE_CANNON,
                EntityType.FRUIT_CANNON,
                EntityType.SPYING_EASTER_BUNNY,
                EntityType.XMAS_FACTORY,
                EntityType.HOT_CHOCOLATE_BALLISTA,
                EntityType.CHOCOLATE_FOUNTAIN,
                EntityType.DONUT_FACTORY
            ]
    
            for (const entityType of [...entities, EntityType.CREAM + '.AROUND.BUILDING']) {
                const parent = scene.current.getMeshByName(entityType + '__root__');
                const children = parent.getChildren()[0].getChildren().length > 0 ? parent.getChildren()[0].getChildren() : parent.getChildren();
    
                children.forEach(child => {
                    if (highlight) {
                        child.visibility = 0;
                    } else {
                        child.visibility = 1;
                    }
                });
            }
            scene.current.render();
        },
        triggerDonutInfo: triggerDonutInfo,
        spawnInfo: spawnInfo,
        opponentGameFieldDistance: opponentGameFieldDistance.current,
        detonateAtPosition: detonateAtPosition,
        showEnergyBar: showEnergyBar,
        hideEnergyBar: hideEnergyBar,
        setRenderLoop: setRenderLoop
    }));

    useEffect(() => {
        engine.current = new Engine(container.current, true, { preserveDrawingBuffer: true, stencil: true, useHighPrecisionFloats: false }, true);

        const createScene = () => {
            const scene = new BabylonScene(engine.current);
            scene.clearColor = new Color4(0, 0, 0, 0);
            camera.current = new FlyCamera('camera', new Vector3(30, 30, 30), scene);
            camera.current.mode = Camera.ORTHOGRAPHIC_CAMERA;
            camera.current.minZ = 0;
            camera.current.maxZ = 100;
            camera.current.setTarget(Vector3.Zero());
            const light = new HemisphericLight('light', new Vector3(40, 44, 1), scene);
            light.intensity = 0.1;
            light.diffuse = new Color3(1.0, 0.97, 0.93);
            const spot = new DirectionalLight('spot', new Vector3(0, -1, -1), scene);
            spot.intensity = 1;
            spot.position = new Vector3(35, 35, 35)
            loadingView.current.loadAssets(scene)
            return scene;
        }

        scene.current = createScene();
        highlightLayer.current = new HighlightLayer('highlightLayer', scene.current);
        animate.current = () => scene.current.render();
    }, []);

    useEffect(() => {
        window.addEventListener('resize', resize);
        return () => {
            window.removeEventListener('resize', resize);
        }
    }, [resize])

    useEffect(() => {
        if (typeof game !== 'undefined' && lookAtOpponent.current !== 'undefined') {
            if (!lookAtOpponent.current && ((!multiplayer.isLocalPlayer(game.currentPlayerIndex) && game.state !== GameStateTypes.ATTACK_PHASE) ||
                (multiplayer.isLocalPlayer(game.currentPlayerIndex) && game.state === GameStateTypes.ATTACK_PHASE))) {
                lookAtOpponent.current = true;
                performCameraFlight();
            } else if (lookAtOpponent.current && ((!multiplayer.isLocalPlayer(game.currentPlayerIndex) && game.state === GameStateTypes.ATTACK_PHASE) ||
                (multiplayer.isLocalPlayer(game.currentPlayerIndex) && game.state !== GameStateTypes.ATTACK_PHASE))) {
                lookAtOpponent.current = false;
                performCameraFlight();
            }

            if (playerGameField.current !== null) {
                const playerFieldIndex = game.players[multiplayer.localPlayerIndex].fieldIndex;
                const opponentFieldIndex = game.players[1 - multiplayer.localPlayerIndex].fieldIndex;
                opponentGameField.current.update(game.board.fields[opponentFieldIndex]);
                playerGameField.current.update(game.board.fields[playerFieldIndex]);
                scene.current.render();
            }
        }
    }, [game, performCameraFlight]);

    const hideEnergyBar = (position, field) => {
        let height = 6.5;
        if (props.tutorial) {
            height = 5.25;
        } else if (typeof props.game !== 'undefined') {
            if (props.game.board.size.cols === 6) {
                height = 5.5;
            } else if (props.game.board.size.cols === 8) {
                height = 6.1;
            }
        }

        if (position === null) {
            position = new Vector3(field.row, height, field.col);
        }
        const name = `${position.x}-${height}-${position.z}`;
        if (energyBars.current.includes(name)) {
            scene.current.stopAnimation(scene.current.getMeshByName('energy.bar.' + name));
        }
    }

    const showEnergyBar = (entity, position, showShieldEnergyToo = false) => {
        if (showShieldEnergyToo) {
            const cellAt = (board, field, row, col) => board.fields[field].grid[row * board.size.cols + col];
            const selectedCell = cellAt(game.board, game.players[multiplayer.localPlayerIndex].fieldIndex, entity.position.row, entity.position.col);
            if (selectedCell.shielded) {
                showEnergyBar(getFountain(entity.position.row, entity.position.col, game.board, game.players[multiplayer.localPlayerIndex].fieldIndex));
            }
        }

        let height = 6.5;
        if (tutorial) {
            height = 5.25;
        } else if (typeof game !== 'undefined') {
            if (game.board.size.cols === 6) {
                height = 5.5;
            } else if (game.board.size.cols === 8) {
                height = 6.1;
            }
        }

        if (typeof position === 'undefined') {
            position = new Vector3(entity.position.row, height, entity.position.col);
        } else if (!(position instanceof Vector3)) {
            position = new Vector3(position.row, height, position.col);
        } else {
            position.y = height;
        }

        const name = `${position.x}-${height}-${position.z}`;
        hideEnergyBar(position);
        energyBars.current.push(name);

        const energy = entity.hp / entity.max.hp;
        const bar = MeshBuilder.CreatePlane('energy.bar.' + name, { width: energy, height: 0.15 }, scene.current);
        bar.isPickable = false;
        const material = new StandardMaterial('energy.bar.material.' + name, scene.current);
        if (energy < 0.3) {
            material.diffuseColor = Color3.FromHexString("#D05531");
        } else if (energy < 0.6) {
            material.diffuseColor = Color3.FromHexString("#DFBF31");
        } else {
            material.diffuseColor = Color3.FromHexString("#70bf31");
        }

        bar.material = material;
        bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
        bar.position = position.clone();
        bar.position.x = bar.position.x + (1 - energy) * 0.35;
        bar.position.z = bar.position.z - (1 - energy) * 0.35;

        const fade = new Animation("fade", "visibility", 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
        fade.setKeys([{ frame: 0, value: 1.0 }, { frame: 180, value: 0.9 }, { frame: 240, value: 0.0 }]);

        setRenderLoop();
        bar.animations = [fade];

        const uuid = uuidv4();
        animations.current.push({
            id: uuid, target: bar, stopAnimation: () => {
                material.dispose();
                bar.dispose();
                energyBars.current = energyBars.current.filter(bar => bar !== name);
                setRenderLoop(false);
                animations.current = animations.current.filter(callback => callback.id !== uuid);
            }
        });

        scene.current.beginAnimation(bar, 0, 240, false, 1, () => {
            if (animations.current.findIndex(callback => callback.id === uuid) > -1) {
                animations.current.find(callback => callback.id === uuid).stopAnimation();
            }
        });
    }

    const startGame = (game, overrideUiState = false) => {
        const playerFieldIndex = game.players[multiplayer.localPlayerIndex].fieldIndex;
        const opponentFieldIndex = game.players[1 - multiplayer.localPlayerIndex].fieldIndex;
        if ((multiplayer.isLocalPlayer(game.currentPlayerIndex) && game.state !== GameStateTypes.ATTACK_PHASE) ||
            (!multiplayer.isLocalPlayer(game.currentPlayerIndex) && game.state === GameStateTypes.ATTACK_PHASE)) {
            lookAtOpponent.current = false;
        } else {
            lookAtOpponent.current = true;
            performCameraFlight();
        }

        let gamefieldHeight = 5;
        if (tutorial) {
            gamefieldHeight = 3.5;
        } else if (typeof props.game !== 'undefined') {
            if (props.game.board.size.cols === 6) {
                gamefieldHeight = 4;
            } else if (props.game.board.size.cols === 8) {
                gamefieldHeight = 4.5;
            }
        }

        playerGameField.current = new Gamefield(true, new Vector3(0, gamefieldHeight, 0), game.board.fields[playerFieldIndex], playerFieldIndex, game.board.size, scene.current, (row, col, eventX, eventY) => playerFieldClick(row, col, eventX, eventY), run => setRenderLoop(run));
        opponentGameField.current = new Gamefield(false, new Vector3(-opponentGameFieldDistance.current, gamefieldHeight, opponentGameFieldDistance.current), game.board.fields[opponentFieldIndex], opponentFieldIndex, game.board.size, scene.current, (row, col, eventX, eventY) => opponentFieldClick(row, col, eventX, eventY), run => setRenderLoop(run));

        if (overrideUiState) {
            deselectBuildings();
        }
        resize();
    }

    const spawnInfo = (messageType, position, amount, donutType) => {
        if (!(position instanceof Vector3)) {
            position = new Vector3(position.row, 6.5, position.col);
        }

        const id = Date.now();
        const info = MeshBuilder.CreatePlane('info_' + id, { width: 1.65, height: 1.65 }, scene.current);
        info.isPickable = false;
        info.position = position;
        info.position.y = tutorial ? 4 : 6;
        info.billboardMode = Mesh.BILLBOARDMODE_ALL;

        const texture = new DynamicTexture('info_texture_' + id, 208, scene.current);
        const context = texture.getContext();
        const material = new StandardMaterial('info_material_' + id, scene.current);
        material.emissiveTexture = texture;
        material.ambientTexture = texture;
        material.opacityTexture = texture;

        info.material = material;
        const drawInfo = (filename, color, text, donut = false, offsetLeft = 0) => {
            const image = new Image();
            image.src = filename;
            image.onload = () => {
                setRenderLoop();

                if (donut) {
                    context.drawImage(image, offsetLeft, 0, 120, 120, 45, 45, 120, 120);
                } else {
                    context.drawImage(image, 0, 0, image.width * 0.5, image.height * 0.5);
                }
                texture.update();

                if (typeof text !== 'undefined') {
                    let shadowColor = theme.color.primary.dark;
                    if (color === theme.color.accent.light) {
                        shadowColor = theme.color.accent.dark;
                    }

                    texture.drawText(text, 48, 102, 'bold 48px Bangers', shadowColor, null, true, true);
                    texture.drawText(text, 46, 100, 'bold 48px Bangers', color, null, true, true);
                }

                const flyaway = new Animation('flyaway_' + id, "position.y", 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
                const fade = new Animation("fade", "visibility", 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
                fade.setKeys([{ frame: 0, value: 1.0 }, { frame: 100, value: .8 }, { frame: 120, value: 0.0 }]);
                const keyframes = [{ frame: 0, value: info.position.y }, { frame: 120, value: info.position.y + 2.5 }];
                flyaway.setKeys(keyframes);
                info.animations = [flyaway, fade];
                const uuid = uuidv4();
                animations.current.push({
                    id: uuid, target: info, stopAnimation: () => {
                        info.dispose();
                        texture.dispose();
                        material.dispose();
                        setRenderLoop(false);
                        animations.current = animations.current.filter(callback => callback.id !== uuid);
                    }
                });
                scene.current.beginAnimation(info, 0, 180, false, 1, () => {
                    if (animations.current.findIndex(callback => callback.id === uuid) > -1) {
                        animations.current.find(callback => callback.id === uuid).stopAnimation();
                    }
                });
            }
        }

        if (messageType === InfoType.CACAO_HARVESTED) {
            drawInfo('/images/cacao.svg', theme.color.primary.light, '+' + amount);
        } else if (messageType === InfoType.CACAO_CONSUMED) {
            drawInfo('/images/cacao.svg', theme.color.accent.light, '-' + amount);
        } else if (messageType === InfoType.INCREASE_CACAO_PER_TURN) {
            drawInfo('/images/cacaoPerTurn.png', theme.color.primary.light, '+' + amount);
        } else if (messageType === InfoType.INCREASE_BUILDINGS_PER_TURN) {
            drawInfo('/images/buildingsPerTurn.png', theme.color.primary.light, '+' + amount);
        } else if (messageType === InfoType.INCREASE_ATTACKS_PER_TURN) {
            drawInfo('/images/attacksPerTurn.png', theme.color.primary.light, '+' + amount);
        } else if (messageType === InfoType.INCREASE_SPY_ATTACKS_PER_TURN) {
            drawInfo('/images/spyAttacksPerTurn.png', theme.color.primary.light, '+' + amount);
        } else if (messageType === InfoType.BUNNY_CAUGHT) {
            drawInfo('/images/bunnyCaught.png');
        } else if (messageType === InfoType.DONUT_TRAP) {
            let offsetLeft = 120;
            if (donutType === EntityType.DONUT_PORTAL_BLUE) {
                offsetLeft = 240;
            } else if (donutType === EntityType.DONUT_HEALTH_GREEN) {
                offsetLeft = 480;
            } else if (donutType === EntityType.DONUT_CREAM_WHITE) {
                offsetLeft = 600;
            } else if (donutType === EntityType.DONUT_SURPRISE_YELLOW) {
                offsetLeft = 360;
            }
            drawInfo('/images/donut_icon_palette.png', undefined, undefined, true, offsetLeft);
        }
    }

    const triggerDonutInfo = (donut, position) => {
        if (typeof position === 'undefined') {
            position = new Vector3(donut.position.row, 6.5, donut.position.col);
        } else {
            position.y = 6.5;
        }
        spawnInfo(InfoType.DONUT_TRAP, position, undefined, donut.type);
    }

    const detonateAtPosition = (row, col, playerField = false) => {
        const truffle = MeshBuilder.CreateTorus('knot', { diameter: 0.1 }, scene.current);
        truffle.material = scene.current.getMaterialByName(BoardCellTypes.BROWN + '.material');
        if (playerField) {
            truffle.position = new Vector3(row, 5, col);
            playerGameField.current.explode(truffle);
        } else {
            truffle.position = new Vector3(row - opponentGameFieldDistance.current, 5, col + opponentGameFieldDistance.current);
            opponentGameField.current.explode(truffle);
        }
    }

    const getFountain = (row, col, board, field) => {
        const cellAt = (board, field, row, col) => board.fields[field].grid[row * board.size.cols + col];
        const neighbors = [];
        for (let r = row - 1; r < row + 2; r++) {
            for (let c = col - 1; c < col + 2; c++) {
                if (r >= 0 && c >= 0 && r < board.size.rows && c < board.size.cols) {
                    neighbors.push(cellAt(board, field, r, c));
                }
            }
        }
        const cellsWithFountains = neighbors.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.CHOCOLATE_FOUNTAIN));
        if (cellsWithFountains.length > 0) {
            return cellsWithFountains[0].occupiedBy.filter(entity => entity.type === EntityType.CHOCOLATE_FOUNTAIN)[0];
        } else {
            return undefined;
        }
    }

    const playerFieldClick = (row, col, position) => {
        if (tutorial) {
            return;
        }

        let player = game.players[multiplayer.localPlayerIndex]
        const buildingSelected = selectedBuilding;
        const initialPlacement = game.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT || game.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT;

        if (buildingSelected || (initialPlacement && player.buildingsPerTurn === 0)) {
            let building;
            if (initialPlacement) {
                building = createEntity(EntityType.FACTORY, player.level);
            } else {
                building = createEntity(selectedBuilding, player.level);
            }
            building.position = { row: row, col: col };
            let playerCacaoPerTurnBefore = player.cacaoPerTurn;
            let buildingsPerTurnBefore = player.buildingsPerTurn;
            build({ issuer: player.id, building: building }).then(() => {
                player = game.players[multiplayer.localPlayerIndex]
                Jukebox.playSound(Jukebox.SOUNDS.UI_BUILD);
                if (building.type === EntityType.DONUT_PORTAL_BLUE) {
                    selectBuilding(EntityType.DONUT_PORTAL_RED);
                    tapBuilding(EntityType.DONUT_PORTAL_RED);
                } else if (isDonut(building.type)) {
                    deselectBuildings();
                }

                if (building.type !== EntityType.CREAM) {
                    showEnergyBar(building);
                }
                if (initialPlacement) {
                    spawnInfo(InfoType.INCREASE_BUILDINGS_PER_TURN, position.clone(), player.buildingsPerTurn);
                    deselectBuildings();
                    deselectAttack();
                    let playerId = player.id;
                    setTimeout(() => {
                        let description = getEntityDescriptor(EntityType.FACTORY, player.level);
                        spawnInfo(InfoType.INCREASE_CACAO_PER_TURN, position.clone(), description.cacaoPerTurn);
                    }, 1000);
                    setTimeout(() => {
                        if (playerId === player.id) {
                            finishTurn({ issuer: player.id });
                            deselectBuildings();
                            deselectAttack();
                        }
                    }, 3000);
                } else {
                    const description = getEntityDescriptor(building.type, player.level);
                    if (!isDonut(building.type)) {
                        spawnInfo(InfoType.CACAO_CONSUMED, position.clone(), description.costs);
                    }
                    const cacaoDelta = player.cacaoPerTurn - playerCacaoPerTurnBefore;
                    const buildingsDelta = player.buildingsPerTurn - buildingsPerTurnBefore;
                    setTimeout(() => {
                        if (typeof game !== 'undefined') {
                            if (building.type === EntityType.CACAOTREE) {
                                spawnInfo(InfoType.INCREASE_CACAO_PER_TURN, position.clone(), cacaoDelta);
                            } else if (building.type === EntityType.RUM_TRUFFLE_CANNON) {
                                spawnInfo(InfoType.INCREASE_ATTACKS_PER_TURN, position.clone(), 1);
                            } else if (building.type === EntityType.FACTORY_EXTENSION) {
                                spawnInfo(InfoType.INCREASE_BUILDINGS_PER_TURN, position.clone(), buildingsDelta);
                            } else if (building.type === EntityType.SPYING_EASTER_BUNNY) {
                                spawnInfo(InfoType.INCREASE_SPY_ATTACKS_PER_TURN, position.clone(), 1);
                            }
                            setTimeout(() => {
                                if (typeof game !== 'undefined') {
                                    player = game.players[multiplayer.localPlayerIndex]
                                    if (player.donuts.length === 0 && (player.buildings === 0 || player.cacao < getCheapest().costs)) {
                                        if (playerHasAttacks(player) === true) {
                                            finishBuildPhase({ issuer: player.id }).then(() => {
                                                deselectBuildings();
                                            }).catch(error => {
                                                if (error instanceof BattlechocError) {
                                                    logger.warn(error);
                                                } else {
                                                    throw error;
                                                }
                                            });
                                        } else {
                                            finishTurn({ issuer: player.id }).then(() => {
                                                deselectBuildings();
                                                deselectAttack();
                                            }).catch(error => {
                                                if (error instanceof BattlechocError) {
                                                    logger.warn(error);
                                                } else {
                                                    throw error;
                                                }
                                            });
                                        }
                                    }
                                }
                            }, 2000);
                        }
                    }, 1000);
                }
            }).catch(error => {
                if (error instanceof BattlechocError) {
                    logger.warn(error);
                } else {
                    throw error;
                }
            });
        }
    }

    const opponentFieldClick = (row, col, position) => {
        if (tutorial) {
            return;
        }

        if (multiplayer.isLocalPlayer(game.currentPlayerIndex) && game.state === GameStateTypes.ATTACK_PHASE) {
            let attack = 0;
            if (selectedAttack === AttackType.TRUFFLE) {
                const description = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON, game.players[multiplayer.localPlayerIndex].level);
                attack = description.attack;
            } else if (selectedAttack === AttackType.FRUIT) {
                const description = getEntityDescriptor(EntityType.FRUIT_CANNON, game.players[multiplayer.localPlayerIndex].level);
                attack = description.attack;
            }

            const damage = (1 + ((Math.random() * 0.4) - 0.2)) * attack;

            const attackParams = {
                issuer: game.players[multiplayer.localPlayerIndex].id,
                attackType: selectedAttack,
                damage: damage,
                row: row,
                col: col
            };

            const cellAt = (board, field, row, col) => board.fields[field].grid[row * board.size.cols + col];
            let selectedCell = cellAt(game.board, game.players[1 - multiplayer.localPlayerIndex].fieldIndex, row, col);
            const cellContainsDonut = selectedCell.occupiedBy.some(entity => isDonut(entity.type));
            const donut = cellContainsDonut ? selectedCell.occupiedBy.filter(entity => isDonut(entity.type))[0] : null;
            props.attack(attackParams).then(() => {
                selectedCell = cellAt(game.board, game.players[1 - multiplayer.localPlayerIndex].fieldIndex, row, col);
                if (cellContainsDonut && !selectedCell.occupiedBy.some(entity => isDonut(entity.type))) {
                    triggerDonutInfo(donut, position.clone());
                }

                if (attackParams.attackType === AttackType.BUNNY) {
                    if (game.players[multiplayer.localPlayerIndex].attacksPerTurn[AttackType.BUNNY] > 0) {
                        Jukebox.playSound(Jukebox.SOUNDS.ATTACK_BUNNY);
                    } else {
                        Jukebox.playSound(Jukebox.SOUNDS.BUNNY_CAUGHT);
                        spawnInfo(InfoType.BUNNY_CAUGHT, position.clone());
                    }
                } else if (typeof attackParams.attackType !== 'undefined') {
                    Jukebox.playSound(Jukebox.SOUNDS.ATTACK_EXPLOSION);
                    detonateAtPosition(row, col);
                    if (selectedCell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM).length > 0) {
                        if (selectedCell.shielded) {
                            showEnergyBar(getFountain(row, col, game.board, game.players[1 - multiplayer.localPlayerIndex].fieldIndex), position.clone());
                        } else {
                            showEnergyBar(selectedCell.occupiedBy.filter(entity => entity.type !== EntityType.CREAM)[0], position.clone());
                        }
                    } else {
                        hideEnergyBar(position.clone());
                    }
                }

                if (game.players[multiplayer.localPlayerIndex].attacks[attackParams.attackType] === 0) {
                    const attackTypes = [AttackType.TRUFFLE, AttackType.FRUIT, AttackType.HOT_CHOCOLATE, AttackType.BUNNY];
                    let undepletedAttack = attackTypes.filter(attackType => game.players[multiplayer.localPlayerIndex].attacks[attackType] > 0);
                    if (undepletedAttack.length > 0) {
                        selectAttack(undepletedAttack[0]).catch(error => {
                            if (error instanceof BattlechocError) {
                                logger.warn(error);
                            } else {
                                throw error;
                            }
                        });
                    }
                }
            }).catch(error => {
                if (error instanceof BattlechocError) {
                    logger.warn(error);
                } else {
                    throw error;
                }
            });
        }
    }

    const setRenderLoop = (run = true) => {
        if (run) {
            if (renderLoopRepetitions.current === 0) {
                engine.current.runRenderLoop(animate.current);
            }
            renderLoopRepetitions.current += 1;
        } else if (!run) {
            renderLoopRepetitions.current -= 1;
            if (renderLoopRepetitions.current === 0) {
                engine.current.stopRenderLoop(animate.current);
            }
        }
    }

    return (
        <div>
            {props.assetsReady ? null : <AssetLoadingView customRef={loadingView} />}
            <canvas className="gameCanvas" ref={container} />
        </div>
    );
};

const mapStateToProps = state => ({
    game: state.gameplay.game,
    level: state.ui.playerInfos.stats.level,
    selectedBuilding: state.ui.selectedBuilding,
    selectedAttack: state.ui.selectedAttack,
    assetsReady: state.ui.assetsReady,
    tutorial: state.ui.tutorial
});

const mapDispatchToProps = {
    finishTurn,
    build,
    attack,
    deselectBuildings,
    selectAttack,
    selectBuilding,
    tapBuilding,
    deselectAttack,
    finishBuildPhase
};

const SceneContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Scene);

export default SceneContainer;