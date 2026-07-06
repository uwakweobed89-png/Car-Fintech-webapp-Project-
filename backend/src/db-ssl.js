const fs = require('fs');
const path = require('path');

// Verify the RDS server's TLS certificate against AWS's public RDS CA bundle
// instead of blindly trusting whatever cert is presented. The old
// `rejectUnauthorized: false` still encrypted the connection but skipped
// verification, leaving it open to a man-in-the-middle. Bundle source:
//   https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
// Refresh the bundle before the AWS RDS roots expire.
const ca = fs.readFileSync(
  path.join(__dirname, '..', 'certs', 'rds-global-bundle.pem'),
  'utf8',
);

module.exports = { rejectUnauthorized: true, ca };
