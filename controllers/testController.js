const { nanoid } = require('nanoid');
const TestResult = require('../models/TestResult');
const Patient = require('../models/Patient');
const { sendReportSms } = require('../services/sms');

async function createTest(req, res, next) {
  try {
    const patient = await Patient.findOne({ _id: req.body.patientId, createdBy: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const reportToken = nanoid(16);
    const test = await TestResult.create({
      patient: patient._id,
      reportToken,
      testType: req.body.testType,
      collectedAt: req.body.collectedAt,
      items: req.body.items,
      notes: req.body.notes,
      createdBy: req.user._id,
    });

    const reportUrl = `${process.env.FRONTEND_URL}/report/${reportToken}`;
    try {
      await sendReportSms(patient.phone, patient.name, reportUrl);
      test.smsSent = true;
      await test.save();
    } catch (smsErr) {
      console.error('SMS send failed:', smsErr.message);
    }

    res.status(201).json({ test, reportUrl });
  } catch (err) {
    next(err);
  }
}

async function getTests(req, res, next) {
  try {
    const tests = await TestResult.find({ createdBy: req.user._id })
      .populate('patient', 'name phone')
      .sort({ createdAt: -1 });
    res.json(tests);
  } catch (err) {
    next(err);
  }
}

async function getTestsByPatient(req, res, next) {
  try {
    const tests = await TestResult.find({ patient: req.params.patientId, createdBy: req.user._id })
      .sort({ createdAt: -1 });
    res.json(tests);
  } catch (err) {
    next(err);
  }
}

module.exports = { createTest, getTests, getTestsByPatient };
