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

    const material = new THREE.MeshBasicMaterial({ color: '#926239'});
    const loader = new GLTFLoader();

    loader.load(
        'models/cannon.glb',
        ( gltf ) => {
            this.cannon = new THREE.Mesh(gltf.scene.children[2].geometry, material);
            this.cannon.scale.set(.01, .01, .01);
            this.scene.add(this.cannon);
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
    this.cannon.rotation.y += 0.01;
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
