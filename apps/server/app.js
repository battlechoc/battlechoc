const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({
  	name: 'battlechoc',
  	version: 0.6
  });
});

app.listen(3000, () => {
  console.log('battlechoc backend listening on port 3000!');
});
