const mongoose = require("mongoose");

const childSchema = new mongoose.Schema({
  childName: String,
  parentName: String,
  phoneNumber: String,
  age: Number,
  gender: String,
  weight: Number,

  height: Number,
  bmi: Number,
  bmiCategory: String,
  anemiaStatus: String,

  heightImage: String, // Full URL
  eyeImage: String,    // Full URL

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Child", childSchema);