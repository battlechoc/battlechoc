    const {InjectManifest} = require('workbox-webpack-plugin');
    const path = require('path');

    module.exports = {
      webpack: function(config, env) {
        config.plugins.push(
          new InjectManifest({
            swSrc: path.join(__dirname, 'src', 'custom-service-worker.js'),
            swDest: 'service-worker.js',
            maximumFileSizeToCacheInBytes: 20971520
          })
        );

        return config;
      }
    }