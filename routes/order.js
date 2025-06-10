const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const router = express.Router();
// Create a new meal (Admin only)
router.post('/meals', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.is_admin) {
            return res.status(403).json({ 
                success: false,
                error: 'Admin access required' 
            });
        }

        const {
            name,
            description,
            price,
            category,
            image_url,
            prep_time,
            ingredients,
            nutritional_info,
            allergens,
            is_available = true,
            is_featured = false,
            serving_size,
            spice_level
        } = req.body;

        // Validate required fields
        if (!name || !description || !price || !category) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, description, price, and category are required'
            });
        }

        // Validate price
        if (isNaN(price) || parseFloat(price) <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Price must be a positive number'
            });
        }

        // Validate prep_time if provided
        if (prep_time !== undefined && (isNaN(prep_time) || parseInt(prep_time) < 0)) {
            return res.status(400).json({
                success: false,
                error: 'Prep time must be a non-negative number'
            });
        }

        // Check if meal with same name already exists
        const existingMeal = await pool.query(
            'SELECT id FROM meals WHERE LOWER(name) = LOWER($1)',
            [name]
        );

        if (existingMeal.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'A meal with this name already exists'
            });
        }

        // Insert new meal
        const insertQuery = `
            INSERT INTO meals (
                name, description, price, category, image_url, prep_time,
                ingredients, nutritional_info, allergens, is_available, 
                is_featured, serving_size, spice_level, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING *
        `;

        const result = await pool.query(insertQuery, [
            name,
            description,
            parseFloat(price),
            category,
            image_url || null,
            prep_time ? parseInt(prep_time) : 30, // Default 30 minutes
            ingredients || null,
            nutritional_info || null,
            allergens || null,
            Boolean(is_available),
            Boolean(is_featured),
            serving_size || null,
            spice_level || null
        ]);

        const newMeal = result.rows[0];

        res.status(201).json({
            success: true,
            message: 'Meal created successfully',
            data: {
                ...newMeal,
                rating: '0.0',
                review_count: 0
            }
        });

    } catch (error) {
        console.error('Error creating meal:', error);
        
        // Handle specific database errors
        if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({
                success: false,
                error: 'A meal with this name already exists'
            });
        }
        
        if (error.code === '23502') { // Not null constraint violation
            return res.status(400).json({
                success: false,
                error: 'Missing required field'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to create meal'
        });
    }
});

// Update an existing meal (Admin only)
router.put('/meals/:id', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.is_admin) {
            return res.status(403).json({ 
                success: false,
                error: 'Admin access required' 
            });
        }

        const { id } = req.params;
        const {
            name,
            description,
            price,
            category,
            image_url,
            prep_time,
            ingredients,
            nutritional_info,
            allergens,
            is_available,
            is_featured,
            serving_size,
            spice_level
        } = req.body;

        // Check if meal exists
        const existingMeal = await pool.query(
            'SELECT * FROM meals WHERE id = $1',
            [id]
        );

        if (existingMeal.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Meal not found'
            });
        }

        // Validate price if provided
        if (price !== undefined && (isNaN(price) || parseFloat(price) <= 0)) {
            return res.status(400).json({
                success: false,
                error: 'Price must be a positive number'
            });
        }

        // Validate prep_time if provided
        if (prep_time !== undefined && (isNaN(prep_time) || parseInt(prep_time) < 0)) {
            return res.status(400).json({
                success: false,
                error: 'Prep time must be a non-negative number'
            });
        }

        // Check if another meal with same name exists (excluding current meal)
        if (name) {
            const nameCheck = await pool.query(
                'SELECT id FROM meals WHERE LOWER(name) = LOWER($1) AND id != $2',
                [name, id]
            );

            if (nameCheck.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: 'A meal with this name already exists'
                });
            }
        }

        // Build update query dynamically
        const updateFields = [];
        const updateValues = [];
        let paramCount = 0;

        const fieldsToUpdate = {
            name, description, price, category, image_url, prep_time,
            ingredients, nutritional_info, allergens, is_available,
            is_featured, serving_size, spice_level
        };

        Object.entries(fieldsToUpdate).forEach(([key, value]) => {
            if (value !== undefined) {
                paramCount++;
                updateFields.push(`${key} = $${paramCount}`);
                
                if (key === 'price') {
                    updateValues.push(parseFloat(value));
                } else if (key === 'prep_time') {
                    updateValues.push(parseInt(value));
                } else if (key === 'is_available' || key === 'is_featured') {
                    updateValues.push(Boolean(value));
                } else {
                    updateValues.push(value);
                }
            }
        });

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        // Add updated_at field
        paramCount++;
        updateFields.push(`updated_at = $${paramCount}`);
        updateValues.push(new Date());

        // Add ID for WHERE clause
        paramCount++;
        updateValues.push(id);

        const updateQuery = `
            UPDATE meals 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await pool.query(updateQuery, updateValues);

        // Get updated meal with rating info
        const mealWithRating = await pool.query(`
            SELECT m.*, 
                   COALESCE(AVG(r.rating), 0) as rating,
                   COUNT(r.id) as review_count
            FROM meals m
            LEFT JOIN reviews r ON m.id = r.meal_id
            WHERE m.id = $1
            GROUP BY m.id
        `, [id]);

        res.json({
            success: true,
            message: 'Meal updated successfully',
            data: {
                ...mealWithRating.rows[0],
                rating: parseFloat(mealWithRating.rows[0].rating).toFixed(1),
                review_count: parseInt(mealWithRating.rows[0].review_count)
            }
        });

    } catch (error) {
        console.error('Error updating meal:', error);
        
        // Handle specific database errors
        if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({
                success: false,
                error: 'A meal with this name already exists'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to update meal'
        });
    }
});

// Delete a meal (Admin only)
router.delete('/meals/:id', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.is_admin) {
            return res.status(403).json({ 
                success: false,
                error: 'Admin access required' 
            });
        }

        const { id } = req.params;

        // Check if meal exists
        const existingMeal = await pool.query(
            'SELECT * FROM meals WHERE id = $1',
            [id]
        );

        if (existingMeal.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Meal not found'
            });
        }

        // Check if meal has any orders (optional - you might want to prevent deletion)
        const orderCheck = await pool.query(
            'SELECT COUNT(*) as count FROM order_items WHERE meal_id = $1',
            [id]
        );

        if (parseInt(orderCheck.rows[0].count) > 0) {
            // Instead of deleting, mark as unavailable
            await pool.query(
                'UPDATE meals SET is_available = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [id]
            );

            return res.json({
                success: true,
                message: 'Meal marked as unavailable due to existing orders'
            });
        }

        // Delete the meal (this will cascade delete reviews due to foreign key)
        await pool.query('DELETE FROM meals WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Meal deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting meal:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete meal'
        });
    }
});
// Get Menu with pagination, search, and filtering
router.get('/meals', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            category,
            search,
            sortBy = 'name',
            sortOrder = 'ASC',
            minPrice,
            maxPrice,
            minRating
        } = req.query;

        const offset = (page - 1) * limit;
        let query = `
            SELECT m.*, 
                   COALESCE(AVG(r.rating), 0) as rating,
                   COUNT(r.id) as review_count
            FROM meals m
            LEFT JOIN reviews r ON m.id = r.meal_id
            WHERE m.is_available = true
        `;
        
        const queryParams = [];
        let paramCount = 0;

        // Add filters
        if (category && category !== 'All') {
            paramCount++;
            query += ` AND m.category = $${paramCount}`;
            queryParams.push(category);
        }

        if (search) {
            paramCount++;
            query += ` AND (m.name ILIKE $${paramCount} OR m.description ILIKE $${paramCount})`;
            queryParams.push(`%${search}%`);
        }

        if (minPrice) {
            paramCount++;
            query += ` AND m.price >= $${paramCount}`;
            queryParams.push(parseFloat(minPrice));
        }

        if (maxPrice) {
            paramCount++;
            query += ` AND m.price <= $${paramCount}`;
            queryParams.push(parseFloat(maxPrice));
        }

        query += ` GROUP BY m.id`;

        if (minRating) {
            query += ` HAVING COALESCE(AVG(r.rating), 0) >= ${parseFloat(minRating)}`;
        }

        // Add sorting
        const validSortFields = ['name', 'price', 'rating', 'created_at', 'prep_time'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
        const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        
        if (sortBy === 'rating') {
            query += ` ORDER BY rating ${order}, m.name ASC`;
        } else {
            query += ` ORDER BY m.${sortField} ${order}`;
        }

        // Add pagination
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        queryParams.push(parseInt(limit));

        paramCount++;
        query += ` OFFSET $${paramCount}`;
        queryParams.push(offset);

        const result = await pool.query(query, queryParams);

        // Get total count for pagination
        let countQuery = `
            SELECT COUNT(DISTINCT m.id) as total
            FROM meals m
            LEFT JOIN reviews r ON m.id = r.meal_id
            WHERE m.is_available = true
        `;
        
        const countParams = [];
        let countParamIndex = 0;

        if (category && category !== 'All') {
            countParamIndex++;
            countQuery += ` AND m.category = $${countParamIndex}`;
            countParams.push(category);
        }

        if (search) {
            countParamIndex++;
            countQuery += ` AND (m.name ILIKE $${countParamIndex} OR m.description ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
        }

        if (minPrice) {
            countParamIndex++;
            countQuery += ` AND m.price >= $${countParamIndex}`;
            countParams.push(parseFloat(minPrice));
        }

        if (maxPrice) {
            countParamIndex++;
            countQuery += ` AND m.price <= $${countParamIndex}`;
            countParams.push(parseFloat(maxPrice));
        }

        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            meals: result.rows.map(meal => ({
                ...meal,
                rating: parseFloat(meal.rating).toFixed(1),
                review_count: parseInt(meal.review_count)
            })),
            totalCount,
            page: parseInt(page),
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        });
    } catch (error) {
        console.error('Error fetching meals:', error);
        res.status(500).json({ error: 'Failed to fetch meals' });
    }
});

// Get featured meals
router.get('/meals/featured', async (req, res) => {
    try {
        const query = `
            SELECT m.*, 
                   COALESCE(AVG(r.rating), 0) as rating,
                   COUNT(r.id) as review_count
            FROM meals m
            LEFT JOIN reviews r ON m.id = r.meal_id
            WHERE m.is_featured = true AND m.is_available = true
            GROUP BY m.id
            ORDER BY rating DESC, m.created_at DESC
            LIMIT 10
        `;
        
        const result = await pool.query(query);
        res.json(result.rows.map(meal => ({
            ...meal,
            rating: parseFloat(meal.rating).toFixed(1),
            review_count: parseInt(meal.review_count)
        })));
    } catch (error) {
        console.error('Error fetching featured meals:', error);
        res.status(500).json({ error: 'Failed to fetch featured meals' });
    }
});

// Get single meal by ID with reviews
router.get('/meals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const mealQuery = `
            SELECT m.*, 
                   COALESCE(AVG(r.rating), 0) as rating,
                   COUNT(r.id) as review_count
            FROM meals m
            LEFT JOIN reviews r ON m.id = r.meal_id
            WHERE m.id = $1
            GROUP BY m.id
        `;
        
        const mealResult = await pool.query(mealQuery, [id]);
        
        if (mealResult.rows.length === 0) {
            return res.status(404).json({ error: 'Meal not found' });
        }

        // Get recent reviews
        const reviewsQuery = `
            SELECT r.*, u.name as user_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.meal_id = $1
            ORDER BY r.created_at DESC
            LIMIT 5
        `;
        
        const reviewsResult = await pool.query(reviewsQuery, [id]);

        const meal = {
            ...mealResult.rows[0],
            rating: parseFloat(mealResult.rows[0].rating).toFixed(1),
            review_count: parseInt(mealResult.rows[0].review_count),
            recent_reviews: reviewsResult.rows
        };

        res.json(meal);
    } catch (error) {
        console.error('Error fetching meal:', error);
        res.status(500).json({ error: 'Failed to fetch meal' });
    }
});

// Get all categories
router.get('/categories', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT category 
            FROM meals 
            WHERE is_available = true 
            ORDER BY category
        `;
        const result = await pool.query(query);
        const categories = result.rows.map(row => row.category);
        res.json({ categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Place Order (Enhanced)
router.post('/bookings', authenticateToken, async (req, res) => {
    const { mealId, quantity, deliveryTime, specialInstructions = '' } = req.body;
    
    if (!mealId || !quantity || quantity < 1) {
        return res.status(400).json({ error: 'Invalid booking data' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if meal exists and is available
        const mealCheck = await client.query(
            'SELECT * FROM meals WHERE id = $1 AND is_available = true',
            [mealId]
        );

        if (mealCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Meal not found or unavailable' });
        }

        const meal = mealCheck.rows[0];

        // Create order
        const orderRes = await client.query(`
            INSERT INTO orders (user_id, status, total_amount, delivery_time, special_instructions) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id, created_at
        `, [
            req.user.id, 
            'pending', 
            meal.price * quantity,
            deliveryTime || null,
            specialInstructions
        ]);

        const orderId = orderRes.rows[0].id;
        const createdAt = orderRes.rows[0].created_at;

        // Add order item
        await client.query(`
            INSERT INTO order_items (order_id, meal_id, quantity, unit_price) 
            VALUES ($1, $2, $3, $4)
        `, [orderId, mealId, quantity, meal.price]);

        // Calculate estimated delivery time (30-45 minutes from now)
        const estimatedDelivery = new Date();
        estimatedDelivery.setMinutes(estimatedDelivery.getMinutes() + meal.prep_time + 30);

        await client.query('COMMIT');

        res.status(201).json({
            id: orderId,
            status: 'pending',
            estimatedDelivery: estimatedDelivery.toISOString(),
            totalAmount: meal.price * quantity,
            message: 'Booking created successfully'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Order creation error:', err);
        res.status(500).json({ error: 'Failed to create booking' });
    } finally {
        client.release();
    }
});

// Get user's bookings/orders
router.get('/bookings', authenticateToken, async (req, res) => {
    try {
        const { status, limit = 10, offset = 0 } = req.query;
        
        let query = `
            SELECT o.*, 
                   json_agg(
                       json_build_object(
                           'meal_id', oi.meal_id,
                           'meal_name', m.name,
                           'quantity', oi.quantity,
                           'unit_price', oi.unit_price,
                           'meal_image', m.image_url
                       )
                   ) as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN meals m ON oi.meal_id = m.id
            WHERE o.user_id = $1
        `;
        
        const queryParams = [req.user.id];
        let paramCount = 1;

        if (status) {
            paramCount++;
            query += ` AND o.status = $${paramCount}`;
            queryParams.push(status);
        }

        query += `
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;
        
        queryParams.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, queryParams);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching user bookings:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// Update order status (for admin/restaurant)
router.patch('/bookings/:id/status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Check if order belongs to user or user is admin
        const orderCheck = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND (user_id = $2 OR $3 = true)',
            [id, req.user.id, req.user.is_admin || false]
        );

        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found or access denied' });
        }

        const result = await pool.query(
            'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Add review for a meal
router.post('/meals/:id/reviews', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }

        // Check if user has ordered this meal
        const orderCheck = await pool.query(`
            SELECT COUNT(*) as count
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.user_id = $1 AND oi.meal_id = $2 AND o.status = 'delivered'
        `, [req.user.id, id]);

        if (parseInt(orderCheck.rows[0].count) === 0) {
            return res.status(400).json({ error: 'You can only review meals you have ordered and received' });
        }

        // Check if user already reviewed this meal
        const existingReview = await pool.query(
            'SELECT id FROM reviews WHERE user_id = $1 AND meal_id = $2',
            [req.user.id, id]
        );

        if (existingReview.rows.length > 0) {
            // Update existing review
            const result = await pool.query(`
                UPDATE reviews 
                SET rating = $1, comment = $2, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $3 AND meal_id = $4
                RETURNING *
            `, [rating, comment, req.user.id, id]);

            res.json({ message: 'Review updated successfully', review: result.rows[0] });
        } else {
            // Create new review
            const result = await pool.query(`
                INSERT INTO reviews (user_id, meal_id, rating, comment)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [req.user.id, id, rating, comment]);

            res.status(201).json({ message: 'Review added successfully', review: result.rows[0] });
        }
    } catch (error) {
        console.error('Error adding review:', error);
        res.status(500).json({ error: 'Failed to add review' });
    }
});

// Get meal statistics (for admin)
router.get('/admin/stats', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM meals WHERE is_available = true) as total_meals,
                (SELECT COUNT(*) FROM orders WHERE status != 'cancelled') as total_orders,
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status = 'delivered') as total_revenue,
                (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
                (SELECT AVG(rating) FROM reviews) as average_rating
        `);

        // Get popular meals
        const popularMeals = await pool.query(`
            SELECT m.name, COUNT(oi.meal_id) as order_count
            FROM meals m
            JOIN order_items oi ON m.id = oi.meal_id
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status != 'cancelled'
            GROUP BY m.id, m.name
            ORDER BY order_count DESC
            LIMIT 5
        `);

        res.json({
            ...stats.rows[0],
            average_rating: parseFloat(stats.rows[0].average_rating || 0).toFixed(1),
            popular_meals: popularMeals.rows
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Search meals with autocomplete
router.get('/meals/search/suggestions', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json([]);
        }

        const query = `
            SELECT DISTINCT name
            FROM meals
            WHERE name ILIKE $1 AND is_available = true
            ORDER BY name
            LIMIT 10
        `;
        
        const result = await pool.query(query, [`%${q}%`]);
        const suggestions = result.rows.map(row => row.name);
        
        res.json(suggestions);
    } catch (error) {
        console.error('Error fetching search suggestions:', error);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
});
// Get meals by category
router.get('/meals/category/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const {
            page = 1,
            limit = 20,
            sortBy = 'name',
            sortOrder = 'ASC',
            minPrice,
            maxPrice,
            minRating
        } = req.query;

        const offset = (page - 1) * limit;
        
        let query = `
            SELECT m.*, 
                   COALESCE(AVG(r.rating), 0) as rating,
                   COUNT(r.id) as review_count
            FROM meals m
            LEFT JOIN reviews r ON m.id = r.meal_id
            WHERE m.is_available = true AND m.category = $1
        `;
        
        const queryParams = [category];
        let paramCount = 1;

        // Add additional filters
        if (minPrice) {
            paramCount++;
            query += ` AND m.price >= $${paramCount}`;
            queryParams.push(parseFloat(minPrice));
        }

        if (maxPrice) {
            paramCount++;
            query += ` AND m.price <= $${paramCount}`;
            queryParams.push(parseFloat(maxPrice));
        }

        query += ` GROUP BY m.id`;

        if (minRating) {
            query += ` HAVING COALESCE(AVG(r.rating), 0) >= ${parseFloat(minRating)}`;
        }

        // Add sorting
        const validSortFields = ['name', 'price', 'rating', 'created_at', 'prep_time'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
        const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        
        if (sortBy === 'rating') {
            query += ` ORDER BY rating ${order}, m.name ASC`;
        } else {
            query += ` ORDER BY m.${sortField} ${order}`;
        }

        // Add pagination
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        queryParams.push(parseInt(limit));

        paramCount++;
        query += ` OFFSET $${paramCount}`;
        queryParams.push(offset);

        const result = await pool.query(query, queryParams);

        // Get total count for pagination
        let countQuery = `
            SELECT COUNT(DISTINCT m.id) as total
            FROM meals m
            LEFT JOIN reviews r ON m.id = r.meal_id
            WHERE m.is_available = true AND m.category = $1
        `;
        
        const countParams = [category];
        let countParamIndex = 1;

        if (minPrice) {
            countParamIndex++;
            countQuery += ` AND m.price >= $${countParamIndex}`;
            countParams.push(parseFloat(minPrice));
        }

        if (maxPrice) {
            countParamIndex++;
            countQuery += ` AND m.price <= $${countParamIndex}`;
            countParams.push(parseFloat(maxPrice));
        }

        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalCount / limit);

        // Check if category exists
        if (result.rows.length === 0 && page === 1) {
            // Verify if category exists at all
            const categoryCheck = await pool.query(
                'SELECT COUNT(*) as count FROM meals WHERE category = $1 AND is_available = true',
                [category]
            );
            
            if (parseInt(categoryCheck.rows[0].count) === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Category not found or no meals available in this category',
                    data: []
                });
            }
        }

        res.json({
            success: true,
            message: 'Meals retrieved successfully',
            data: result.rows.map(meal => ({
                ...meal,
                rating: parseFloat(meal.rating).toFixed(1),
                review_count: parseInt(meal.review_count)
            })),
            pagination: {
                totalCount,
                page: parseInt(page),
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                limit: parseInt(limit)
            },
            category: category
        });
    } catch (error) {
        console.error('Error fetching meals by category:', error);
        res.status(500).json({ 
            success: false,
            message: 'Failed to fetch meals by category',
            data: []
        });
    }
});

module.exports = router;
