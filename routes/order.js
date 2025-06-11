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

        // Validate spice_level if provided
        const validSpiceLevels = ['mild', 'medium', 'hot', 'very_hot'];
        if (spice_level && !validSpiceLevels.includes(spice_level)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid spice level. Must be: mild, medium, hot, or very_hot'
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
            prep_time ? parseInt(prep_time) : 30,
            ingredients || null,
            nutritional_info ? JSON.stringify(nutritional_info) : null,
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
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                error: 'A meal with this name already exists'
            });
        }
        
        if (error.code === '23502') {
            return res.status(400).json({
                success: false,
                error: 'Missing required field'
            });
        }

        if (error.code === '23514') {
            return res.status(400).json({
                success: false,
                error: 'Invalid data format or constraint violation'
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

        // Validate spice_level if provided
        const validSpiceLevels = ['mild', 'medium', 'hot', 'very_hot'];
        if (spice_level && !validSpiceLevels.includes(spice_level)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid spice level. Must be: mild, medium, hot, or very_hot'
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
                } else if (key === 'nutritional_info' && value) {
                    updateValues.push(JSON.stringify(value));
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
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                error: 'A meal with this name already exists'
            });
        }

        if (error.code === '23514') {
            return res.status(400).json({
                success: false,
                error: 'Invalid data format or constraint violation'
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

        // Check if meal has any orders
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

// Get meals with pagination, search, and filtering
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
            minRating,
            featured,
            available = 'true'
        } = req.query;

        const offset = (page - 1) * limit;
        let query = `
            SELECT m.*, 
                   COALESCE(AVG(r.rating), 0) as rating,
                   COUNT(r.id) as review_count
            FROM meals m
            LEFT JOIN reviews r ON m.id = r.meal_id
            WHERE 1=1
        `;
        
        const queryParams = [];
        let paramCount = 0;

        // Add availability filter
        if (available === 'true') {
            paramCount++;
            query += ` AND m.is_available = $${paramCount}`;
            queryParams.push(true);
        }

        // Add filters
        if (category && category !== 'All') {
            paramCount++;
            query += ` AND m.category = $${paramCount}`;
            queryParams.push(category);
        }

        if (search) {
            paramCount++;
            query += ` AND (m.name ILIKE $${paramCount} OR m.description ILIKE $${paramCount} OR m.ingredients ILIKE $${paramCount})`;
            queryParams.push(`%${search}%`);
        }

        if (featured === 'true') {
            paramCount++;
            query += ` AND m.is_featured = $${paramCount}`;
            queryParams.push(true);
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
        const validSortFields = ['name', 'price', 'rating', 'created_at', 'prep_time', 'category'];
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
            WHERE 1=1
        `;
        
        const countParams = [];
        let countParamIndex = 0;

        if (available === 'true') {
            countParamIndex++;
            countQuery += ` AND m.is_available = $${countParamIndex}`;
            countParams.push(true);
        }

        if (category && category !== 'All') {
            countParamIndex++;
            countQuery += ` AND m.category = $${countParamIndex}`;
            countParams.push(category);
        }

        if (search) {
            countParamIndex++;
            countQuery += ` AND (m.name ILIKE $${countParamIndex} OR m.description ILIKE $${countParamIndex} OR m.ingredients ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
        }

        if (featured === 'true') {
            countParamIndex++;
            countQuery += ` AND m.is_featured = $${countParamIndex}`;
            countParams.push(true);
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
            success: true,
            message: 'Meals retrieved successfully',
            data: result.rows.map(meal => ({
                ...meal,
                rating: parseFloat(meal.rating).toFixed(1),
                review_count: parseInt(meal.review_count),
                nutritional_info: meal.nutritional_info ? JSON.parse(meal.nutritional_info) : null
            })),
            pagination: {
                totalCount,
                page: parseInt(page),
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching meals:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch meals' 
        });
    }
});

// Get featured meals
router.get('/meals/featured', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const query = `
            SELECT m.*, 
                   COALESCE(AVG(r.rating), 0) as rating,
                   COUNT(r.id) as review_count
            FROM meals m
            LEFT JOIN reviews r ON m.id = r.meal_id
            WHERE m.is_featured = true AND m.is_available = true
            GROUP BY m.id
            ORDER BY rating DESC, m.created_at DESC
            LIMIT $1
        `;
        
        const result = await pool.query(query, [parseInt(limit)]);
        
        res.json({
            success: true,
            message: 'Featured meals retrieved successfully',
            data: result.rows.map(meal => ({
                ...meal,
                rating: parseFloat(meal.rating).toFixed(1),
                review_count: parseInt(meal.review_count),
                nutritional_info: meal.nutritional_info ? JSON.parse(meal.nutritional_info) : null
            }))
        });
    } catch (error) {
        console.error('Error fetching featured meals:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch featured meals' 
        });
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
            return res.status(404).json({ 
                success: false,
                error: 'Meal not found' 
            });
        }

        // Get recent reviews
        const reviewsQuery = `
            SELECT r.*, u.name as user_name, u.email as user_email
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.meal_id = $1
            ORDER BY r.created_at DESC
            LIMIT 10
        `;
        
        const reviewsResult = await pool.query(reviewsQuery, [id]);

        const meal = {
            ...mealResult.rows[0],
            rating: parseFloat(mealResult.rows[0].rating).toFixed(1),
            review_count: parseInt(mealResult.rows[0].review_count),
            nutritional_info: mealResult.rows[0].nutritional_info ? JSON.parse(mealResult.rows[0].nutritional_info) : null,
            recent_reviews: reviewsResult.rows
        };

        res.json({
            success: true,
            message: 'Meal retrieved successfully',
            data: meal
        });
    } catch (error) {
        console.error('Error fetching meal:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch meal' 
        });
    }
});

// Get all categories
router.get('/categories', async (req, res) => {
    try {
        const { available = 'true' } = req.query;
        
        let query = `
            SELECT DISTINCT category, COUNT(*) as meal_count
            FROM meals 
            WHERE 1=1
        `;
        
        const queryParams = [];
        
        if (available === 'true') {
            query += ` AND is_available = $1`;
            queryParams.push(true);
        }
        
        query += ` GROUP BY category ORDER BY category`;
        
        const result = await pool.query(query, queryParams);
        
        res.json({ 
            success: true,
            message: 'Categories retrieved successfully',
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch categories' 
        });
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
                review_count: parseInt(meal.review_count),
                nutritional_info: meal.nutritional_info ? JSON.parse(meal.nutritional_info) : null
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

// Search meals with autocomplete
router.get('/meals/search/suggestions', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({
                success: true,
                message: 'Search suggestions retrieved successfully',
                data: []
            });
        }

        const query = `
            SELECT DISTINCT name, category, price
            FROM meals
            WHERE (name ILIKE $1 OR description ILIKE $1 OR ingredients ILIKE $1) 
            AND is_available = true
            ORDER BY name
            LIMIT $2
        `;
        
        const result = await pool.query(query, [`%${q}%`, parseInt(limit)]);
        
        res.json({
            success: true,
            message: 'Search suggestions retrieved successfully',
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching search suggestions:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch suggestions' 
        });
    }
});

// Place Order (Enhanced)
router.post('/orders', authenticateToken, async (req, res) => {
    const { items, delivery_time, special_instructions, delivery_address } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ 
            success: false,
            error: 'Order must contain at least one item' 
        });
    }

    // Validate items
    for (const item of items) {
        if (!item.meal_id || !item.quantity || item.quantity < 1) {
            return res.status(400).json({ 
                success: false,
                error: 'Each item must have a valid meal_id and quantity' 
            });
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let totalAmount = 0;
        const orderItems = [];

        // Validate all meals and calculate total
        for (const item of items) {
            const mealCheck = await client.query(
                'SELECT * FROM meals WHERE id = $1 AND is_available = true',
                [item.meal_id]
            );

            if (mealCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ 
                    success: false,
                    error: `Meal with ID ${item.meal_id} not found or unavailable` 
                });
            }

            const meal = mealCheck.rows[0];
            const itemTotal = meal.price * item.quantity;
            totalAmount += itemTotal;

            orderItems.push({
                meal_id: item.meal_id,
                quantity: item.quantity,
                unit_price: meal.price,
                meal_name: meal.name,
                prep_time: meal.prep_time
            });
        }

        // Calculate estimated delivery time
        const maxPrepTime = Math.max(...orderItems.map(item => item.prep_time || 30));
        const estimatedDelivery = new Date();
        estimatedDelivery.setMinutes(estimatedDelivery.getMinutes() + maxPrepTime + 30);

        // Create order
        const orderRes = await client.query(`
            INSERT INTO orders (user_id, status, total_amount, delivery_time, special_instructions, delivery_address) 
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *
        `, [
            req.user.id, 
            'pending', 
            totalAmount,
            delivery_time || estimatedDelivery,
            special_instructions || '',
            delivery_address || ''
        ]);

        const order = orderRes.rows[0];

        // Add order items
        for (const item of orderItems) {
            await client.query(`
                INSERT INTO order_items (order_id, meal_id, quantity, unit_price)
VALUES ($1, $2, $3, $4)
            `, [order.id, item.meal_id, item.quantity, item.unit_price]);
        }

        await client.query('COMMIT');

        // Fetch the complete order with items
        const completeOrder = await pool.query(`
            SELECT 
                o.*,
                u.name as user_name,
                u.email as user_email,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', oi.id,
                            'meal_id', oi.meal_id,
                            'meal_name', m.name,
                            'quantity', oi.quantity,
                            'unit_price', oi.unit_price,
                            'subtotal', oi.quantity * oi.unit_price
                        )
                    ) FILTER (WHERE oi.id IS NOT NULL), 
                    '[]'::json
                ) as items
            FROM orders o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN meals m ON oi.meal_id = m.id
            WHERE o.id = $1
            GROUP BY o.id, u.name, u.email
        `, [order.id]);

        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            data: completeOrder.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error placing order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to place order'
        });
    } finally {
        client.release();
    }
});

// Get user's orders
router.get('/orders', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                o.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', oi.id,
                            'meal_id', oi.meal_id,
                            'meal_name', m.name,
                            'quantity', oi.quantity,
                            'unit_price', oi.unit_price,
                            'subtotal', oi.quantity * oi.unit_price,
                            'image_url', m.image_url
                        )
                    ) FILTER (WHERE oi.id IS NOT NULL), 
                    '[]'::json
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

        query += ` GROUP BY o.id ORDER BY o.created_at DESC`;

        // Add pagination
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        queryParams.push(parseInt(limit));

        paramCount++;
        query += ` OFFSET $${paramCount}`;
        queryParams.push(offset);

        const result = await pool.query(query, queryParams);

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM orders WHERE user_id = $1`;
        const countParams = [req.user.id];

        if (status) {
            countQuery += ` AND status = $2`;
            countParams.push(status);
        }

        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            success: true,
            message: 'Orders retrieved successfully',
            data: result.rows,
            pagination: {
                totalCount,
                page: parseInt(page),
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch orders'
        });
    }
});

// Get single order by ID
router.get('/orders/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                o.*,
                u.name as user_name,
                u.email as user_email,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', oi.id,
                            'meal_id', oi.meal_id,
                            'meal_name', m.name,
                            'meal_description', m.description,
                            'quantity', oi.quantity,
                            'unit_price', oi.unit_price,
                            'subtotal', oi.quantity * oi.unit_price,
                            'image_url', m.image_url
                        )
                    ) FILTER (WHERE oi.id IS NOT NULL), 
                    '[]'::json
                ) as items
            FROM orders o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN meals m ON oi.meal_id = m.id
            WHERE o.id = $1 AND (o.user_id = $2 OR $3 = true)
            GROUP BY o.id, u.name, u.email
        `;

        const result = await pool.query(query, [id, req.user.id, req.user.is_admin]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Order not found or access denied'
            });
        }

        res.json({
            success: true,
            message: 'Order retrieved successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch order'
        });
    }
});

// Update order status (Admin only)
router.put('/orders/:id/status', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be: ' + validStatuses.join(', ')
            });
        }

        const result = await pool.query(
            'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        res.json({
            success: true,
            message: 'Order status updated successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update order status'
        });
    }
});

// Get all orders (Admin only)
router.get('/admin/orders', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const { page = 1, limit = 20, status, user_id } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                o.*,
                u.name as user_name,
                u.email as user_email,
                COUNT(oi.id) as item_count
            FROM orders o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE 1=1
        `;

        const queryParams = [];
        let paramCount = 0;

        if (status) {
            paramCount++;
            query += ` AND o.status = $${paramCount}`;
            queryParams.push(status);
        }

        if (user_id) {
            paramCount++;
            query += ` AND o.user_id = $${paramCount}`;
            queryParams.push(user_id);
        }

        query += ` GROUP BY o.id, u.name, u.email ORDER BY o.created_at DESC`;

        // Add pagination
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        queryParams.push(parseInt(limit));

        paramCount++;
        query += ` OFFSET $${paramCount}`;
        queryParams.push(offset);

        const result = await pool.query(query, queryParams);

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM orders o WHERE 1=1`;
        const countParams = [];
        let countParamIndex = 0;

        if (status) {
            countParamIndex++;
            countQuery += ` AND o.status = $${countParamIndex}`;
            countParams.push(status);
        }

        if (user_id) {
            countParamIndex++;
            countQuery += ` AND o.user_id = $${countParamIndex}`;
            countParams.push(user_id);
        }

        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            success: true,
            message: 'Orders retrieved successfully',
            data: result.rows,
            pagination: {
                totalCount,
                page: parseInt(page),
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch orders'
        });
    }
});

// Cancel order
router.put('/orders/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if order exists and belongs to user (or user is admin)
        const orderCheck = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND (user_id = $2 OR $3 = true)',
            [id, req.user.id, req.user.is_admin]
        );

        if (orderCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Order not found or access denied'
            });
        }

        const order = orderCheck.rows[0];

        // Check if order can be cancelled
        const cancelableStatuses = ['pending', 'confirmed'];
        if (!cancelableStatuses.includes(order.status)) {
            return res.status(400).json({
                success: false,
                error: 'Order cannot be cancelled at this stage'
            });
        }

        const result = await pool.query(
            'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            ['cancelled', id]
        );

        res.json({
            success: true,
            message: 'Order cancelled successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel order'
        });
    }
});

// Create a review
router.post('/reviews', authenticateToken, async (req, res) => {
    try {
        const { meal_id, rating, comment } = req.body;

        if (!meal_id || !rating) {
            return res.status(400).json({
                success: false,
                error: 'Meal ID and rating are required'
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                error: 'Rating must be between 1 and 5'
            });
        }

        // Check if meal exists
        const mealCheck = await pool.query('SELECT * FROM meals WHERE id = $1', [meal_id]);
        if (mealCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Meal not found'
            });
        }

        // Check if user has ordered this meal
        const orderCheck = await pool.query(`
            SELECT COUNT(*) as count 
            FROM orders o 
            JOIN order_items oi ON o.id = oi.order_id 
            WHERE o.user_id = $1 AND oi.meal_id = $2 AND o.status = 'delivered'
        `, [req.user.id, meal_id]);

        if (parseInt(orderCheck.rows[0].count) === 0) {
            return res.status(403).json({
                success: false,
                error: 'You can only review meals you have ordered and received'
            });
        }

        // Insert or update review
        const result = await pool.query(`
            INSERT INTO reviews (user_id, meal_id, rating, comment, created_at, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, meal_id) 
            DO UPDATE SET 
                rating = EXCLUDED.rating,
                comment = EXCLUDED.comment,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [req.user.id, meal_id, rating, comment || '']);

        res.status(201).json({
            success: true,
            message: 'Review submitted successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error creating review:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit review'
        });
    }
});

// Get reviews for a meal
router.get('/meals/:id/reviews', async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                r.*,
                u.name as user_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.meal_id = $1
            ORDER BY r.created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await pool.query(query, [id, parseInt(limit), offset]);

        // Get total count and rating stats
        const statsQuery = `
            SELECT 
                COUNT(*) as total_reviews,
                AVG(rating) as average_rating,
                COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
                COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
                COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
                COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
                COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
            FROM reviews 
            WHERE meal_id = $1
        `;

        const statsResult = await pool.query(statsQuery, [id]);
        const stats = statsResult.rows[0];

        const totalPages = Math.ceil(stats.total_reviews / limit);

        res.json({
            success: true,
            message: 'Reviews retrieved successfully',
            data: result.rows,
            stats: {
                total_reviews: parseInt(stats.total_reviews),
                average_rating: parseFloat(stats.average_rating || 0).toFixed(1),
                rating_distribution: {
                    5: parseInt(stats.five_star),
                    4: parseInt(stats.four_star),
                    3: parseInt(stats.three_star),
                    2: parseInt(stats.two_star),
                    1: parseInt(stats.one_star)
                }
            },
            pagination: {
                totalCount: parseInt(stats.total_reviews),
                page: parseInt(page),
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch reviews'
        });
    }
});

// Get user's reviews
router.get('/reviews', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                r.*,
                m.name as meal_name,
                m.image_url as meal_image
            FROM reviews r
            JOIN meals m ON r.meal_id = m.id
            WHERE r.user_id = $1
            ORDER BY r.created_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await pool.query(query, [req.user.id, parseInt(limit), offset]);

        // Get total count
        const countResult = await pool.query(
            'SELECT COUNT(*) as total FROM reviews WHERE user_id = $1',
            [req.user.id]
        );
        const totalCount = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            success: true,
            message: 'Reviews retrieved successfully',
            data: result.rows,
            pagination: {
                totalCount,
                page: parseInt(page),
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching user reviews:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch reviews'
        });
    }
});

// Delete a review
router.delete('/reviews/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if review exists and belongs to user (or user is admin)
        const reviewCheck = await pool.query(
            'SELECT * FROM reviews WHERE id = $1 AND (user_id = $2 OR $3 = true)',
            [id, req.user.id, req.user.is_admin]
        );

        if (reviewCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Review not found or access denied'
            });
        }

        await pool.query('DELETE FROM reviews WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Review deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete review'
        });
    }
});

// Get dashboard stats (Admin only)
router.get('/admin/dashboard', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        // Get various statistics
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE is_admin = false) as total_customers,
                (SELECT COUNT(*) FROM meals WHERE is_available = true) as total_meals,
                (SELECT COUNT(*) FROM orders) as total_orders,
                (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
                (SELECT COUNT(*) FROM orders WHERE status = 'preparing') as preparing_orders,
                (SELECT COUNT(*) FROM orders WHERE status = 'ready') as ready_orders,
                (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status = 'delivered') as total_revenue,
                (SELECT COALESCE(AVG(rating), 0) FROM reviews) as average_rating,
                (SELECT COUNT(*) FROM reviews) as total_reviews
        `);

        // Get recent orders
        const recentOrders = await pool.query(`
            SELECT 
                o.id,
                o.status,
                o.total_amount,
                o.created_at,
                u.name as user_name,
                COUNT(oi.id) as item_count
            FROM orders o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            GROUP BY o.id, u.name
            ORDER BY o.created_at DESC
            LIMIT 10
        `);

        // Get popular meals
        const popularMeals = await pool.query(`
            SELECT 
                m.id,
                m.name,
                m.price,
                COUNT(oi.id) as order_count,
                COALESCE(AVG(r.rating), 0) as rating
            FROM meals m
            LEFT JOIN order_items oi ON m.id = oi.meal_id
            LEFT JOIN reviews r ON m.id = r.meal_id
            WHERE m.is_available = true
            GROUP BY m.id, m.name, m.price
            ORDER BY order_count DESC, rating DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            message: 'Dashboard data retrieved successfully',
            data: {
                stats: {
                    ...stats.rows[0],
                    total_revenue: parseFloat(stats.rows[0].total_revenue).toFixed(2),
                    average_rating: parseFloat(stats.rows[0].average_rating).toFixed(1)
                },
                recent_orders: recentOrders.rows,
                popular_meals: popularMeals.rows.map(meal => ({
                    ...meal,
                    rating: parseFloat(meal.rating).toFixed(1),
                    order_count: parseInt(meal.order_count)
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard data'
        });
    }
});

// Get order statistics
router.get('/admin/stats/orders', authenticateToken, async (req, res) => {
    try {
        if (!req.user.is_admin) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        const { period = '7d' } = req.query;

        let dateCondition = '';
        switch (period) {
            case '24h':
                dateCondition = "created_at >= NOW() - INTERVAL '24 hours'";
                break;
            case '7d':
                dateCondition = "created_at >= NOW() - INTERVAL '7 days'";
                break;
            case '30d':
                dateCondition = "created_at >= NOW() - INTERVAL '30 days'";
                break;
            case '90d':
                dateCondition = "created_at >= NOW() - INTERVAL '90 days'";
                break;
            default:
                dateCondition = "created_at >= NOW() - INTERVAL '7 days'";
        }

        const query = `
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as order_count,
                SUM(total_amount) as revenue,
                AVG(total_amount) as avg_order_value
            FROM orders 
            WHERE ${dateCondition}
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `;

        const result = await pool.query(query);

        res.json({
            success: true,
            message: 'Order statistics retrieved successfully',
            data: result.rows.map(row => ({
                ...row,
                revenue: parseFloat(row.revenue || 0).toFixed(2),
                avg_order_value: parseFloat(row.avg_order_value || 0).toFixed(2),
                order_count: parseInt(row.order_count)
            }))
        });

    } catch (error) {
        console.error('Error fetching order statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch order statistics'
        });
    }
});

module.exports = router;
