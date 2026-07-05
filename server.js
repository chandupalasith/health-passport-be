require('dotenv').config();
const path         = require('path');
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const mongoose     = require('mongoose');

const authRoutes      = require('./routes/auth');
const patientRoutes   = require('./routes/patients');
const orderRoutes     = require('./routes/orders');
const reportRoutes    = require('./routes/reports');
const templateRoutes  = require('./routes/templates');
const categoryRoutes  = require('./routes/categories');
const publicRoutes    = require('./routes/public');
const dashboardRoutes    = require('./routes/dashboard');
const labRoutes          = require('./routes/labs');
const superAdminRoutes   = require('./routes/superadmin');
const userRoutes         = require('./routes/users');
const salesRoutes        = require('./routes/sales');
const doctorRoutes       = require('./routes/doctors');
const commissionRoutes         = require('./routes/commissions');
const collectingCenterRoutes   = require('./routes/collecting-centers');
const { errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 5001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Serve uploaded files in development only — in production files live in S3
if (process.env.NODE_ENV !== 'production') {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Protected routes ────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/patients',  patientRoutes);
app.use('/api/orders',    orderRoutes);
app.use('/api/reports',   reportRoutes);
app.use('/api/templates',  templateRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/labs',       labRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/sales',       salesRoutes);
app.use('/api/doctors',     doctorRoutes);
app.use('/api/commissions',       commissionRoutes);
app.use('/api/collecting-centers', collectingCenterRoutes);

// ── Public routes (no auth) ─────────────────────────────────────────────────
app.use('/api/public', publicRoutes);

app.use(errorHandler);

if (!process.env.MONGO_URI) {
  console.error('FATAL: MONGO_URI environment variable is not set.');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () =>
      console.log(`Backend running on http://localhost:${PORT}`),
    );
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
