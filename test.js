// db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Set to false for hosted DBs like Railway or Supabase
  }
});

// Test connection
pool.connect()
  .then(client => {
    return client.query('SELECT NOW()')
      .then(res => {
        console.log('✅ PostgreSQL connected:', res.rows[0]);
        client.release();
      })
      .catch(err => {
        client.release();
        console.error('❌ Query error:', err.stack);
      });
  })
  .catch(err => {
    console.error('❌ Connection error:', err.stack);
  });

module.exports = pool;
