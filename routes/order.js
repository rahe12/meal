const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const router = express.Router();

// Get Menu
router.get('/menu', async (req, res) => {
    const result = await pool.query('SELECT * FROM meals');
    res.json(result.rows);
});

// Place Order
router.post('/order', authenticateToken, async (req, res) => {
    const { items } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const orderRes = await client.query(
            'INSERT INTO orders (user_id) VALUES ($1) RETURNING id',
            [req.user.id]
        );
        const orderId = orderRes.rows[0].id;

        for (const item of items) {
            await client.query(
                'INSERT INTO order_items (order_id, meal_id, quantity) VALUES ($1, $2, $3)',
                [orderId, item.meal_id, item.quantity]
            );
        }

        const total = await client.query(`
            SELECT SUM(m.price * oi.quantity) AS total
            FROM order_items oi
            JOIN meals m ON m.id = oi.meal_id
            WHERE oi.order_id = $1
        `, [orderId]);

        await client.query('COMMIT');
        res.json({ order_id: orderId, total_price: total.rows[0].total });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send('Order failed');
    } finally {
        client.release();
    }
});

module.exports = router;
