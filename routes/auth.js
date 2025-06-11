const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const router = express.Router();
require('dotenv').config();

// Register
router.post('/register', async (req, res) => {
    const { name, email, password, is_admin = false } = req.body;
    
    try {
        // Validate required fields
        if (!name || !email || !password) {
            return res.status(400).json({ 
                error: 'Name, email, and password are required' 
            });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1', 
            [email]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ 
                error: 'User with this email already exists' 
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert new user
        const result = await pool.query(
            'INSERT INTO users (name, email, password, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, name, email, is_admin, created_at',
            [name, email, hashedPassword, is_admin]
        );

        const newUser = result.rows[0];
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                id: newUser.id, 
                email: newUser.email, 
                is_admin: newUser.is_admin 
            }, 
            process.env.SECRET_KEY,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                is_admin: newUser.is_admin,
                created_at: newUser.created_at
            },
            token
        });

    } catch (err) {
        console.error('Registration error:', err);
        
        // Handle unique constraint violation
        if (err.code === '23505') {
            return res.status(400).json({ 
                error: 'User with this email already exists' 
            });
        }
        
        res.status(500).json({ 
            error: 'Internal server error during registration' 
        });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email and password are required' 
            });
        }

        // Find user by email
        const result = await pool.query(
            'SELECT id, name, email, password, is_admin, created_at FROM users WHERE email = $1', 
            [email]
        );
        
        const user = result.rows[0];
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                is_admin: user.is_admin 
            }, 
            process.env.SECRET_KEY,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                is_admin: user.is_admin,
                created_at: user.created_at
            },
            token
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ 
            error: 'Internal server error during login' 
        });
    }
});

// Get user profile (optional - requires authentication middleware)
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, is_admin, created_at FROM users WHERE id = $1',
            [req.user.id]
        );

        const user = result.rows[0];
        
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found' 
            });
        }

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                is_admin: user.is_admin,
                created_at: user.created_at
            }
        });

    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ 
            error: 'Internal server error' 
        });
    }
});

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ 
            error: 'Access token required' 
        });
    }

    jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                error: 'Invalid or expired token' 
            });
        }
        req.user = user;
        next();
    });
}

module.exports = router;
