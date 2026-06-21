const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const USE_S3 = process.env.NODE_ENV === 'production' && !!process.env.AWS_S3_BUCKET;

// ── Storage backend ───────────────────────────────────────────────────────────

let storage;

if (USE_S3) {
  const { S3Client }  = require('@aws-sdk/client-s3');
  const multerS3      = require('multer-s3');

  const s3 = new S3Client({ region: process.env.AWS_REGION });

  storage = multerS3({
    s3,
    bucket:      process.env.AWS_S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `letterheads/${req.params.labId}_${Date.now()}${ext}`);
    },
  });
} else {
  // Local disk — used in development
  const LETTERHEAD_DIR = path.join(__dirname, '../uploads/letterheads');
  if (!fs.existsSync(LETTERHEAD_DIR)) fs.mkdirSync(LETTERHEAD_DIR, { recursive: true });

  storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LETTERHEAD_DIR),
    filename:    (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${req.params.labId}_${Date.now()}${ext}`);
    },
  });
}

// ── Multer instance ───────────────────────────────────────────────────────────

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PNG, JPG, and WebP images are accepted. Export your PDF/Word letterhead as a PNG first.'));
};

const uploadLetterhead = multer({
  storage,
  limits:     { fileSize: 8 * 1024 * 1024 },
  fileFilter,
}).single('letterhead');

// Generic single-image upload (logo, signature) — reuses same storage
const uploadImage = multer({
  storage,
  limits:     { fileSize: 5 * 1024 * 1024 },
  fileFilter,
}).single('image');

// ── S3 delete helper (no-op in dev) ──────────────────────────────────────────

async function deleteFile(url) {
  if (!url) return;
  if (url.startsWith('http')) {
    // S3 URL — delete from bucket
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const s3  = new S3Client({ region: process.env.AWS_REGION });
    const key = new URL(url).pathname.slice(1); // strip leading /
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }));
    } catch (_) { /* already deleted or invalid URL */ }
  } else {
    // Relative path — local disk
    const localPath = path.join(__dirname, '..', url);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  }
}

module.exports = { uploadLetterhead, uploadImage, deleteFile };
