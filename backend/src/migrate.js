const fs = require('fs');
const path = require('path');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');

async function main() {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) throw new Error('DB_SECRET_ARN is required to run migrations');

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secret = JSON.parse(response.SecretString);

  const pool = new Pool({
    host: secret.host,
    port: secret.port,
    database: secret.dbname,
    user: secret.username,
    password: secret.password,
    ssl: { rejectUnauthorized: false },
  });

  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema applied successfully');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
