const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const router = express.Router();
require('dotenv').config();

// Register
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashed = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (name, email, password) VALUES ($1, $2, $3)', [name, email, hashed]);
        res.send('User registered successfully');
    } catch (err) {
        res.status(400).send('User already exists or invalid data');
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).send('Email not found');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).send('Invalid password');

    const token = jwt.sign({ id: user.id }, process.env.SECRET_KEY);
    res.json({ token });
});

module.exports = router;
