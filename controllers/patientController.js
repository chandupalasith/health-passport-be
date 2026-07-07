const Patient = require('../models/Patient');

const NO_PHONE = '0000000000';

/**
 * GET /api/patients/search?mobile=07XXXXXXXX
 * Returns { patient } for a normal lookup, or { patient: null, noPhonePatients: [] }
 * when mobile is the no-phone sentinel (0000000000).
 */
async function searchPatient(req, res, next) {
  try {
    const { mobile } = req.query;

    if (!mobile || mobile.trim().length < 7) {
      return res.status(400).json({ message: 'Provide at least 7 digits for mobile search.' });
    }

    // No-phone sentinel: return all no-phone patients so cashier can pick
    if (mobile.trim() === NO_PHONE) {
      const noPhonePatients = await Patient.find({ labId: req.user.labId, noPhone: true })
        .select('name mobile dob ageAtRegistration gender noPhone createdAt')
        .sort({ name: 1 });
      return res.json({ patient: null, noPhonePatients });
    }

    const patient = await Patient.findOne({
      labId: req.user.labId,
      mobile: mobile.trim(),
    }).select('name mobile dob ageAtRegistration gender noPhone createdAt');

    return res.json({ patient: patient ?? null });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/patients
 * Register a new patient for this lab.
 * Body: { name, mobile, dob?, ageAtRegistration? }
 * labId is taken from the verified JWT — never trusted from the body.
 */
async function createPatient(req, res, next) {
  try {
    const { name, mobile, dob, ageAtRegistration, gender } = req.body;

    // ── Validation ─────────────────────────────────────────────────────
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Patient name is required.' });
    }
    if (!mobile || !/^\d{9,15}$/.test(mobile.trim())) {
      return res.status(400).json({ message: 'Valid mobile number is required (9–15 digits).' });
    }
    if (dob && ageAtRegistration != null) {
      return res.status(400).json({ message: 'Provide either DOB or age — not both.' });
    }

    const isNoPhone = mobile.trim() === NO_PHONE;

    // ── Uniqueness within lab (skip for no-phone sentinel) ─────────────
    if (!isNoPhone) {
      const existing = await Patient.findOne({
        labId: req.user.labId,
        mobile: mobile.trim(),
      });
      if (existing) {
        return res.status(409).json({
          message: 'A patient with this mobile number is already registered for your lab.',
          patient: existing,
        });
      }
    }

    const VALID_GENDERS = ['male', 'female'];
    const patient = await Patient.create({
      labId: req.user.labId,
      name:  name.trim(),
      mobile: mobile.trim(),
      noPhone: isNoPhone,
      ...(dob                  ? { dob: new Date(dob) }                         : {}),
      ...(ageAtRegistration != null ? { ageAtRegistration: Number(ageAtRegistration) } : {}),
      ...(gender && VALID_GENDERS.includes(gender) ? { gender }                 : {}),
    });

    return res.status(201).json({ patient });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/patients
 * Returns all patients for the lab (up to 5000), optionally filtered by
 * gender and/or a name/mobile search term.
 * Age-range filtering is handled client-side since it requires mixing
 * DOB-computed age with ageAtRegistration.
 */
async function listCustomers(req, res, next) {
  try {
    const { gender, search } = req.query;
    const filter = { labId: req.user.labId };

    if (gender === 'male' || gender === 'female') {
      filter.gender = gender;
    }

    if (search && search.trim().length >= 2) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: regex }, { mobile: regex }];
    }

    const patients = await Patient.find(filter)
      .select('name mobile dob ageAtRegistration gender createdAt')
      .sort({ createdAt: -1 })
      .limit(5000);

    return res.json({ patients, total: patients.length });
  } catch (err) { next(err); }
}

/**
 * PATCH /api/patients/:patientId
 * Update name, age, or gender of an existing patient.
 * Mobile is intentionally not editable (it's the search key).
 */
async function updatePatient(req, res, next) {
  try {
    const { name, ageAtRegistration, gender } = req.body;

    const patient = await Patient.findOne({ _id: req.params.patientId, labId: req.user.labId });
    if (!patient) return res.status(404).json({ message: 'Patient not found.' });

    if (name             !== undefined) patient.name              = name.trim();
    if (ageAtRegistration !== undefined) patient.ageAtRegistration = ageAtRegistration != null ? Number(ageAtRegistration) : undefined;
    if (gender           !== undefined) patient.gender            = gender || null;

    await patient.save();
    return res.json({ patient });
  } catch (err) { next(err); }
}

module.exports = { searchPatient, createPatient, listCustomers, updatePatient };
