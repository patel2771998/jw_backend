const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');

const SALT_ROUNDS = 12;

const hashPassword = async (password) => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
};

module.exports = { hashPassword, comparePassword, generateToken };
