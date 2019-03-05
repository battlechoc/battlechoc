const mongoose = require('mongoose');
const Schema = mongoose.Schema;

module.exports = mongoose.model('User', 
  new Schema({
    name: { type: String, trim: true, required: true, unique: true },
    password: { type: String, trim: true, required: true, unique: true },
    created: { type: Date, default: Date.now },
    chocolateChips: { type: Number, default: 0 }
  })
);