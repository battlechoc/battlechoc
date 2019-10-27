import React, { Component } from 'react';
import { Scene as BabylonScene, SceneLoader, HemisphericLight, Engine, FlyCamera, Vector3, Color3, Color4, Camera, StandardMaterial } from 'babylonjs';
import { assetLoader, assetVersion } from '../AssetLoader';
import { BoardCellTypes, EntityType } from '../gameplay/GameEntities';
import 'babylonjs-loaders';

class MeshPreview extends Component {

    componentDidMount() {
    	this.props.onRef(this);
        this.engine = new Engine(this.container, true);

        let createScene = () => {
            let scene = new BabylonScene(this.engine);
            new HemisphericLight('light', new Vector3(0,1,0), scene);
            scene.clearColor = new Color4(0, 0, 0, 0);
            this.camera = new FlyCamera("camera", new Vector3(30, 30, 30), scene);
            this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
            this.camera.minZ = 0;
            this.camera.maxZ = 100;

			this.estimateOrthographicSize();
            this.camera.setTarget(Vector3.Zero());			
    		return scene;
        }

        this.scene = createScene();

        this.engine.runRenderLoop(() => {
		    this.scene.render();
		});

		SceneLoader.ImportMesh('', 'models/', assetLoader.assets.models[BoardCellTypes.BROWN] + '?v=' + assetVersion, this.scene, group => {
			let material = new StandardMaterial('brown.field.material', this.scene);
            material.diffuseColor﻿ = Color3.FromHexString("#824529");
            material.sideOrientation = 0;
            group[1].material = material;
            group[1].scaling = new Vector3(1.5, 1, 1.5);
		});
		window.addEventListener('resize', this.resize);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.resize);
    }

    estimateOrthographicSize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        let ratio = width / height;
        let distance = 2

        this.camera.orthoTop = distance;
        this.camera.orthoBottom = - distance;
        this.camera.orthoLeft = - distance * ratio;
        this.camera.orthoRight = distance * ratio;
    }

    resize = () => {
        this.estimateOrthographicSize();
        this.engine.resize();
        this.scene.render();
    }

    rotate = () => {
        this.preview.forEach(mesh => mesh.rotation.y += 0.01);
    }

    loadMesh(entity) {
    	SceneLoader.ImportMesh('', 'models/', assetLoader.assets.models[entity] + '?v=' + assetVersion, this.scene, group => {
    		if (typeof this.preview !== 'undefined') {
    			this.scene.unregisterBeforeRender(this.rotate);
    			this.preview.forEach(mesh => mesh.dispose());
    		}

    		this.preview = group;
        	this.preview[0].getChildren().forEach(mesh => {
        		mesh.scaling = new Vector3(1, 1, 1);
        	});

        	if (entity === EntityType.CHOCOLATE_FOUNTAIN) {
        		console.log(this.preview)
        		this.preview.forEach(mesh => {
	                if (mesh.material) {
	                	if (mesh.material.name === 'Shield') {
	                		mesh.visibility = 0;
	                	}
	                }
            	});
            }

    		this.scene.registerBeforeRender(this.rotate);
    	})
    } 

    render() {
        return <canvas className="previewCanvas" ref={container => { this.container = container }} />;
    }
}

export default MeshPreview;