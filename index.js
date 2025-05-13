const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { cloudinary } = require('./config/cloudinary');
const authRoutes = require('./api/routes/authRoutes');
const adminRoutes = require('./api/routes/adminRoutes');
const studentRoutes = require('./api/routes/studentRoutes');
const complaintRoutes = require('./api/routes/complaintRoutes');
const gpaRoutes = require('./api/routes/gpaRoutes');
const feeRoutes = require('./api/routes/feeRoutes');
const messageRoutes = require('./api/routes/messageRoutes');
const announcementRoutes = require('./api/routes/announcementRoutes');
const errorHandler = require('./api/middleware/errorHandler'); 
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

dotenv.config();
connectDB();

// Middleware to ignore favicon requests
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});
app.post('/api/auth/login');
// API routes
console.log('Registering routes...');
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/complaint', complaintRoutes);
app.use('/api/gpa', gpaRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/announcements', announcementRoutes);



console.log('Routes registered.');



const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
console.log('Cloudinary Config:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
module.exports = app;