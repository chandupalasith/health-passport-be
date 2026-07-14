require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose     = require('mongoose');
const SystemConfig = require('../models/SystemConfig');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const result = await SystemConfig.updateOne(
    { key: 'global' },
    { $set: { hiddenSystemTemplates: [] } },
  );
  console.log('Cleared hiddenSystemTemplates.', result.modifiedCount ? 'Document updated.' : 'Nothing changed.');
  mongoose.disconnect();
}).catch(err => { console.error(err.message); process.exit(1); });
