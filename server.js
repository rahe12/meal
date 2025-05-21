const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/order');

dotenv.config();
const app = express();
app.use(bodyParser.json());

// Routes
app.use('/api', authRoutes);
app.use('/api', orderRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
