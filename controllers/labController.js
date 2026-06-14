const Lab  = require('../models/Lab');
const { deleteFile } = require('../middleware/upload');

async function getLab(req, res, next) {
  try {
    if (req.params.labId !== req.user.labId.toString()) {
      return res.status(403).json({ message: 'Forbidden.' });
    }
    const lab = await Lab.findById(req.params.labId).select('-smsCredentials');
    if (!lab) return res.status(404).json({ message: 'Lab not found.' });
    return res.json({ lab });
  } catch (err) { next(err); }
}

async function updateLab(req, res, next) {
  try {
    if (req.params.labId !== req.user.labId.toString()) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const {
      name, address, phone, reportFooter, logoUrl,
      dialogApiKey, dialogSourceAddress,
      notifyApiKey, notifySenderId,
      printLetterheadPaddingTop, printLetterheadPaddingBottom,
      smsLetterheadPaddingTop,   smsLetterheadPaddingBottom,
    } = req.body;

    const update = {};
    if (name         !== undefined) update.name         = name;
    if (address      !== undefined) update.address      = address;
    if (phone        !== undefined) update.phone        = phone;
    if (reportFooter !== undefined) update.reportFooter = reportFooter;
    if (logoUrl      !== undefined) update.logoUrl      = logoUrl;

    if (printLetterheadPaddingTop    !== undefined) update.printLetterheadPaddingTop    = Number(printLetterheadPaddingTop);
    if (printLetterheadPaddingBottom !== undefined) update.printLetterheadPaddingBottom = Number(printLetterheadPaddingBottom);
    if (smsLetterheadPaddingTop      !== undefined) update.smsLetterheadPaddingTop      = Number(smsLetterheadPaddingTop);
    if (smsLetterheadPaddingBottom   !== undefined) update.smsLetterheadPaddingBottom   = Number(smsLetterheadPaddingBottom);

    if (dialogApiKey        !== undefined) update['smsCredentials.dialogApiKey']        = dialogApiKey;
    if (dialogSourceAddress !== undefined) update['smsCredentials.dialogSourceAddress'] = dialogSourceAddress;
    if (notifyApiKey        !== undefined) update['smsCredentials.apiKey']              = notifyApiKey;
    if (notifySenderId      !== undefined) update['smsCredentials.senderId']            = notifySenderId;

    const lab = await Lab.findByIdAndUpdate(
      req.params.labId,
      { $set: update },
      { new: true, runValidators: true },
    ).select('-smsCredentials');

    if (!lab) return res.status(404).json({ message: 'Lab not found.' });
    return res.json({ lab });
  } catch (err) { next(err); }
}

/**
 * POST /api/labs/:labId/letterhead/:type  (type = 'print' | 'sms')
 * Upload a PNG/JPG letterhead. Replaces any existing one for that type.
 * File is stored on S3 in production, local disk in development.
 * req.file.location (S3) or req.file.filename (disk) determines the stored URL.
 */
async function uploadLetterhead(req, res, next) {
  try {
    if (req.params.labId !== req.user.labId.toString()) {
      return res.status(403).json({ message: 'Forbidden.' });
    }
    const type = req.params.type;
    if (type !== 'print' && type !== 'sms') {
      return res.status(400).json({ message: 'type must be "print" or "sms".' });
    }
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    const urlField = type === 'print' ? 'printLetterheadUrl' : 'smsLetterheadUrl';

    // Delete the previous file (S3 object or local file)
    const existing = await Lab.findById(req.params.labId).select(urlField);
    await deleteFile(existing?.[urlField]);

    // S3 gives req.file.location; local disk gives req.file.filename
    const newUrl = req.file.location ?? `/uploads/letterheads/${req.file.filename}`;

    const lab = await Lab.findByIdAndUpdate(
      req.params.labId,
      { $set: { [urlField]: newUrl } },
      { new: true },
    ).select('-smsCredentials');

    if (!lab) return res.status(404).json({ message: 'Lab not found.' });
    return res.json({ lab });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/labs/:labId/letterhead/:type  (type = 'print' | 'sms')
 * Removes the letterhead image and clears the field.
 */
async function removeLetterhead(req, res, next) {
  try {
    if (req.params.labId !== req.user.labId.toString()) {
      return res.status(403).json({ message: 'Forbidden.' });
    }
    const type = req.params.type;
    if (type !== 'print' && type !== 'sms') {
      return res.status(400).json({ message: 'type must be "print" or "sms".' });
    }

    const urlField = type === 'print' ? 'printLetterheadUrl' : 'smsLetterheadUrl';

    const lab = await Lab.findById(req.params.labId).select(urlField);
    if (!lab) return res.status(404).json({ message: 'Lab not found.' });

    await deleteFile(lab[urlField]);

    const updated = await Lab.findByIdAndUpdate(
      req.params.labId,
      { $set: { [urlField]: null } },
      { new: true },
    ).select('-smsCredentials');

    return res.json({ lab: updated });
  } catch (err) { next(err); }
}

module.exports = { getLab, updateLab, uploadLetterhead, removeLetterhead };
