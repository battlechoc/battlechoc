const express = require('express');
const bodyParser = require('body-parser');
const User = require('./models/User.js');
const app = express();
const cors = require('cors');
const mongoose = require('mongoose');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

app.get('/', (req, res) => {
  res.json({
  	name: 'battlechoc',
  	version: 0.6
  });
});

app.get('/users', (req, res) => {
  User.find({}).then(users => {
    res.json(users); 
  });
});

app.post('/user', (req, res) => {
	console.dir(req.body)
  let name = req.body.name;
  let password = req.body.password;
  if (typeof name !== 'undefined' && typeof password !== 'undefined') {
	  let user = new User({ name: name, password: password });
	  user.save(function(error, user){
	    if (error) {
	      console.error(error);
	      res.status(500).json({'error': 'database error'});
	    } else {
	      res.json(user); 
	    }
	  });
	} else {
		res.status(400).json({error: 'No username provided'})
	}
});

mongoose.connect('mongodb://localhost:27017/battlechoc', { useCreateIndex: true, useNewUrlParser: true }).then(() => {
	app.listen(3000, () => {
	  console.log('battlechoc backend listening on port 3000!');
	});
}).catch(error => console.log('backend does not start, because mongodb is currently not available'));
