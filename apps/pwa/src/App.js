import React, { Component } from 'react';
import './App.css';
import * as THREE from 'three';
import GLTFLoader from 'three-gltf-loader';


class App extends Component {
  componentDidMount() {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      width / height,
      0.1,
      1000
    );

    this.camera.position.z = 40;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor('#000000');
    this.renderer.setSize(width, height);
    this.mount.appendChild(this.renderer.domElement);

    const material = new THREE.MeshPhongMaterial( { color: '#2b1d0e', specular: '#e08b3e', shininess: 30, flatShading: true } )
    const loader = new GLTFLoader();

    loader.load(
        'models/cannon.glb',
        ( gltf ) => {
            this.cannon = new THREE.Mesh(gltf.scene.children[2].geometry, material);
            this.cannon.scale.set(.005, .005, .005);
            this.cannon.rotation.y  = Math.PI / 2
            this.cannon.rotation.x  = Math.PI / 4
            this.cannon.position.set(-42, 6, 1.5);

            this.playerGameField = this.buildGameField();
            this.playerGameField.rotateX(-Math.PI / 8);
            this.playerGameField.position.set(-60, -15, 0);

            this.opponentGameField = this.buildGameField();
            this.opponentGameField.rotateX(-Math.PI / 8);
            this.opponentGameField.position.set(20, -15, 0);

            this.scene.add(this.cannon);
            this.scene.add(this.opponentGameField);
            this.scene.add(this.playerGameField);

            var ambientLight = new THREE.AmbientLight(0x101010, 1.0);
            this.scene.add(ambientLight);
            var directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); 
            directionalLight.position.set(0.0, 0.0, 10.0);
            this.scene.add(directionalLight); 

            this.start();
            window.addEventListener("resize", () => this.updateDimensions());
            console.dir(this.camera)
        },
        ( xhr ) => {
            console.log( `${( xhr.loaded / xhr.total * 100 )}% loaded` );
        },
        ( error ) => {
            console.error( 'An error happened', error );
        },
    );
  }

  buildGameField() {
    var gameField = new THREE.Group();
    const rows = 8;
    const cols = 8;
    const fieldSize = 8;
    var fieldtypes = ['#e08b3e', '#b5651d', '#734012'];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        var geometry = new THREE.PlaneGeometry(fieldSize, fieldSize, 1);
        var fieldtype = fieldtypes[Math.floor(Math.random()*fieldtypes.length)];
        var field = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: fieldtype}));
        field.position.set(fieldSize * i, fieldSize * j, 0);
        gameField.add(field);
      }
    }
    return gameField;
  }

  updateDimensions () {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  componentWillUnmount() {
    this.stop();
    this.mount.removeChild(this.renderer.domElement);
    window.removeEventListener("resize", () => this.updateDimensions());
  }

  start = () => {
    if (!this.frameId) {
      this.frameId = requestAnimationFrame(this.animate);
    }
  }

  stop = () => {
    cancelAnimationFrame(this.frameId);
  }

  animate = () => {
    //this.cannon.rotation.y += 0.01;
    this.renderScene();
    this.frameId = window.requestAnimationFrame(this.animate);
  }

  renderScene = () => {
    this.renderer.render(this.scene, this.camera);
  }

  render() {
    return(
      <div
        className="App"
        ref={(mount) => { this.mount = mount }}
      />
    )
  }
  
}

export default App;
