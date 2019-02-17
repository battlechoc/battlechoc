import GLTFLoader from 'three-gltf-loader';

class ModelLoader {

    constructor(){
        this.loader = new GLTFLoader();
        this.models = [];
    }

    async loadModels() {
        this.models = [
            await this.loadGLTFModel('models/white_tile.gltf'),
            await this.loadGLTFModel('models/brown_tile.gltf'),
            await this.loadGLTFModel('models/black_tile.gltf'),
            await this.loadGLTFModel('models/factory.gltf'),
            await this.loadGLTFModel('models/factory-extension.gltf'),
            await this.loadGLTFModel('models/cacaotree.gltf'),
            await this.loadGLTFModel('models/cannon.gltf'),
            await this.loadGLTFModel('models/cream.gltf'),
            await this.loadGLTFModel('models/cream-explosion.gltf'),
        ];
    }

    loadGLTFModel(filename) {
        return new Promise((resolve, reject) => {
            this.loader.load(filename, resolve);
        });
    }
}

const modelLoader = new ModelLoader();
export default modelLoader;