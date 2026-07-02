const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');

const IMAGES = {
  1:  'https://images.pexels.com/photos/34404246/pexels-photo-34404246.jpeg?auto=compress&cs=tinysrgb&w=800',
  2:  'https://images.pexels.com/photos/3786091/pexels-photo-3786091.jpeg?auto=compress&cs=tinysrgb&w=800',
  3:  'https://images.pexels.com/photos/34939819/pexels-photo-34939819.jpeg?auto=compress&cs=tinysrgb&w=800',
  4:  'https://images.pexels.com/photos/9300916/pexels-photo-9300916.jpeg?auto=compress&cs=tinysrgb&w=800',
  5:  'https://images.pexels.com/photos/166054/pexels-photo-166054.jpeg?auto=compress&cs=tinysrgb&w=800',
  6:  'https://images.pexels.com/photos/9791225/pexels-photo-9791225.jpeg?auto=compress&cs=tinysrgb&w=800',
  7:  'https://images.pexels.com/photos/9482560/pexels-photo-9482560.jpeg?auto=compress&cs=tinysrgb&w=800',
  8:  'https://images.pexels.com/photos/712618/pexels-photo-712618.jpeg?auto=compress&cs=tinysrgb&w=800',
  9:  'https://images.pexels.com/photos/18776100/pexels-photo-18776100.jpeg?auto=compress&cs=tinysrgb&w=800',
  10: 'https://images.pexels.com/photos/18426531/pexels-photo-18426531.jpeg?auto=compress&cs=tinysrgb&w=800',
  11: 'https://images.pexels.com/photos/18948281/pexels-photo-18948281.jpeg?auto=compress&cs=tinysrgb&w=800',
  12: 'https://images.pexels.com/photos/33889816/pexels-photo-33889816.jpeg?auto=compress&cs=tinysrgb&w=800',
  13: 'https://images.pexels.com/photos/34911552/pexels-photo-34911552.jpeg?auto=compress&cs=tinysrgb&w=800',
};

async function main() {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) throw new Error('DB_SECRET_ARN is required');

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

  for (const [id, url] of Object.entries(IMAGES)) {
    const result = await pool.query('UPDATE cars SET image_url = $1 WHERE id = $2', [url, id]);
    console.log(`car ${id}: ${result.rowCount} row(s) updated`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
