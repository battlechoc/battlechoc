    const {InjectManifest} = require('workbox-webpack-plugin');
    const path = require('path');

    module.exports = {
      webpack: function(config, env) {
        config.plugins.push(
          new InjectManifest({
            swSrc: path.join('src', 'custom-service-worker.js'),
            swDest: 'service-worker.js'
          })
        );

        return config;
      }
    }