const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const normalizeGroupName = (value) => String(value || '')
  .replace(/&amp;amp;#x2F;/g, '/')
  .replace(/&amp;#x2F;/g, '/')
  .replace(/&#x2F;/g, '/')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const app = express();
let isDatabaseReady = false;
const defaultFrontendOrigin = 'https://warriors-gymnastics-frontend.onrender.com';

const getFrontendOrigin = () => String(
  process.env.ADMIN_FRONTEND_URL
  || process.env.FRONTEND_URL
  || process.env.CLIENT_URL
  || defaultFrontendOrigin
).replace(/\/+$/, '');

const getBackendOrigin = (req) => {
  const host = req.get('host');
  const isLocal = /^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/i.test(host || '');
  return `${isLocal ? req.protocol : 'https'}://${host}`;
};

const lazyRouter = (loader) => {
  let router = null;
  return (req, res, next) => {
    if (!router) {
      router = loader();
    }
    return router(req, res, next);
  };
};

const allowedOrigins = [
  'https://localhost',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://warriors-gymnastics-frontend.onrender.com',
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));

app.get('/open-admin', (req, res) => {
  const adminUrl = `${getBackendOrigin(req)}/admin/login?source=admin-pwa&from=qr`;

  res.set('Cache-Control', 'no-store');
  res.redirect(302, adminUrl);
});

app.use((req, res, next) => {
  if (req.path === '/api/health') {
    return next();
  }

  if (req.path.startsWith('/api') && !isDatabaseReady) {
    return res.status(503).json({ message: 'System is waking up. Please retry shortly.' });
  }

  return next();
});

app.use('/api/auth', lazyRouter(() => require('./routes/auth')));
app.use('/api/players', lazyRouter(() => require('./routes/players')));
app.use('/api/groups', lazyRouter(() => require('./routes/groups')));
app.use('/api/parents', lazyRouter(() => require('./routes/parents')));
app.use('/api/programs', lazyRouter(() => require('./routes/programs')));
app.use('/api/coaches', lazyRouter(() => require('./routes/coaches')));
app.use('/api/club-media', lazyRouter(() => require('./routes/clubMedia')));
app.use('/api/package-options', lazyRouter(() => require('./routes/packageOptions')));
app.use('/api/waiting-list', lazyRouter(() => require('./routes/waitingList')));
app.use('/api/attendance', lazyRouter(() => require('./routes/attendance')));
app.use('/api/subscriptions', lazyRouter(() => require('./routes/subscriptions')));
app.use('/api/payments', lazyRouter(() => require('./routes/payments')));
app.use('/api/notifications', lazyRouter(() => require('./routes/notifications')));
app.use('/api/push', lazyRouter(() => require('./routes/push')));
app.use('/api/reports', lazyRouter(() => require('./routes/reports')));
app.use('/api/history', lazyRouter(() => require('./routes/history')));
app.use('/api/audit-logs', lazyRouter(() => require('./routes/auditLogs')));
app.use('/api/security', lazyRouter(() => require('./routes/security')));

app.get('/api/health', (req, res) => {
  res.status(isDatabaseReady ? 200 : 503).json({
    status: isDatabaseReady ? 'ok' : 'starting',
    database: isDatabaseReady ? 'connected' : 'connecting',
    time: new Date().toISOString()
  });
});

const frontendStaticPaths = [
  /^\/assets\//,
  /^\/warriors-logo\.png$/,
  /^\/warriors-icon-192\.png$/,
  /^\/warriors-icon-512\.png$/,
  /^\/manifest\.webmanifest$/,
  /^\/admin-manifest\.webmanifest$/,
  /^\/sw\.js$/,
  /^\/favicon\.ico$/
];

const adminSpaPaths = [
  /^\/admin(?:\/.*)?$/,
  /^\/admin-login$/,
  /^\/players(?:\/.*)?$/,
  /^\/groups(?:\/.*)?$/,
  /^\/attendance(?:\/.*)?$/,
  /^\/coaches(?:\/.*)?$/,
  /^\/payments(?:\/.*)?$/,
  /^\/notifications(?:\/.*)?$/,
  /^\/parents(?:\/.*)?$/,
  /^\/reports(?:\/.*)?$/,
  /^\/history(?:\/.*)?$/,
  /^\/security(?:\/.*)?$/,
  /^\/audit-logs(?:\/.*)?$/,
  /^\/owner-summary(?:\/.*)?$/,
  /^\/media-gallery(?:\/.*)?$/
];

const parentSpaPaths = [
  /^\/$/,
  /^\/login$/,
  /^\/parent(?:\/.*)?$/
];

const fetchFrontend = async (path) => {
  const response = await fetch(`${getFrontendOrigin()}${path}`);
  if (!response.ok) {
    const error = new Error(`Frontend returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response;
};

const matchesAny = (patterns, path) => patterns.some((pattern) => pattern.test(path));

app.get('*', async (req, res, next) => {
  if (!matchesAny(frontendStaticPaths, req.path)) {
    return next();
  }

  try {
    const response = await fetchFrontend(req.originalUrl);
    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (req.path.endsWith('.webmanifest')) {
      res.type('application/manifest+json');
    } else if (contentType) {
      res.type(contentType);
    }
    const cacheControl = response.headers.get('cache-control');
    res.set('Cache-Control', cacheControl || (req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'));
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    next(error);
  }
});

app.get('*', async (req, res, next) => {
  if (!matchesAny(adminSpaPaths, req.path)) {
    return next();
  }

  try {
    const response = await fetchFrontend('/admin/login?source=admin-pwa');
    let html = await response.text();
    html = html.replace(/<title>.*?<\/title>/, '<title>Warriors Admin Login</title>');
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html);
  } catch (error) {
    next(error);
  }
});

app.get('*', async (req, res, next) => {
  if (!matchesAny(parentSpaPaths, req.path)) {
    return next();
  }

  try {
    const response = await fetchFrontend(req.originalUrl);
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(await response.text());
  } catch (error) {
    next(error);
  }
});

app.use((req, res, next) => {
  res.status(404).json({ message: 'Resource not found' });
});

app.use(errorHandler);

const initializeDefaultData = async () => {
  const bcrypt = require('bcryptjs');
  const User = require('./models/User');
  const Program = require('./models/Program');
  const TrainingGroup = require('./models/TrainingGroup');

  const existingAdmin = await User.findOne({ email: 'admin@warriorsgym.com' });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('Admin@12345', 12);
    await User.create({ name: 'Warriors Admin', email: 'admin@warriorsgym.com', passwordHash, role: 'admin', phone: '', isActive: true });
    console.log('Seeded default admin user');
  }

  const programs = [
    { name: 'Beginner Program', description: 'Foundation gymnastics for new athletes', level: 'Beginner' },
    { name: 'Intermediate Program', description: 'Skill advancement and discipline', level: 'Intermediate' },
    { name: 'Advanced Program', description: 'Competitive training for experienced gymnasts', level: 'Advanced' }
  ];

  for (const program of programs) {
    const exists = await Program.findOne({ name: program.name });
    if (!exists) {
      await Program.create(program);
    }
  }

  const groupColors = ['#2563eb', '#f2c94c', '#16a34a', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899'];
  const groups = [
    { name: 'Saturday / Wednesday 4:00 PM - 5:00 PM', days: ['Saturday', 'Wednesday'], startTime: '16:00', endTime: '17:00', maxCapacity: 20 },
    { name: 'Saturday / Wednesday 5:00 PM - 6:30 PM', days: ['Saturday', 'Wednesday'], startTime: '17:00', endTime: '18:30', maxCapacity: 20 },
    { name: 'Saturday / Wednesday 6:30 PM - 8:00 PM', days: ['Saturday', 'Wednesday'], startTime: '18:30', endTime: '20:00', maxCapacity: 20 },
    { name: 'Sunday / Tuesday 4:00 PM - 5:00 PM', days: ['Sunday', 'Tuesday'], startTime: '16:00', endTime: '17:00', maxCapacity: 20 },
    { name: 'Sunday / Tuesday 5:00 PM - 6:30 PM', days: ['Sunday', 'Tuesday'], startTime: '17:00', endTime: '18:30', maxCapacity: 20 },
    { name: 'Sunday / Tuesday 6:30 PM - 8:00 PM', days: ['Sunday', 'Tuesday'], startTime: '18:30', endTime: '20:00', maxCapacity: 20 },
    { name: 'Monday / Thursday 4:00 PM - 5:00 PM', days: ['Monday', 'Thursday'], startTime: '16:00', endTime: '17:00', maxCapacity: 20 },
    { name: 'Monday / Thursday 5:00 PM - 6:30 PM', days: ['Monday', 'Thursday'], startTime: '17:00', endTime: '18:30', maxCapacity: 20 },
    { name: 'Monday / Thursday 6:30 PM - 8:00 PM', days: ['Monday', 'Thursday'], startTime: '18:30', endTime: '20:00', maxCapacity: 20 }
  ];

  const existingGroups = await TrainingGroup.find().lean();
  for (const [index, group] of groups.entries()) {
    const exists = existingGroups.find((existingGroup) => normalizeGroupName(existingGroup.name) === group.name);
    if (!exists) {
      await TrainingGroup.create({ ...group, color: groupColors[index], displayOrder: index + 1 });
    }
  }
};

const runStartupMaintenance = async () => {
  const Attendance = require('./models/Attendance');
  const { ensureHistoryBaselines } = require('./utils/history');
  const { cleanupOldAttendanceData } = require('./utils/retention');

  await Promise.all([
    Attendance.syncIndexes(),
    initializeDefaultData(),
    ensureHistoryBaselines()
  ]);

  const cleanupResult = await cleanupOldAttendanceData();
  console.log(`Attendance retention cleanup removed ${cleanupResult.deletedAttendance} attendance records and ${cleanupResult.deletedNotifications} attendance notifications.`);
  setInterval(async () => {
    try {
      const result = await cleanupOldAttendanceData();
      if (result.deletedAttendance || result.deletedNotifications) {
        console.log(`Attendance retention cleanup removed ${result.deletedAttendance} attendance records and ${result.deletedNotifications} attendance notifications.`);
      }
    } catch (error) {
      console.error('Attendance retention cleanup failed:', error.message);
    }
  }, 24 * 60 * 60 * 1000);
};

const startServer = async () => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });

  await connectDB();
  isDatabaseReady = true;

  setTimeout(() => {
    runStartupMaintenance().catch((error) => {
      console.error('Startup maintenance failed:', error.message);
    });
  }, 10000);
};

startServer().catch((error) => {
  console.error('Startup failure:', error.message);
  process.exit(1);
});
