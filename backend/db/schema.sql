CREATE TABLE IF NOT EXISTS cars (
  id            SERIAL PRIMARY KEY,
  make          VARCHAR(50)     NOT NULL,
  model         VARCHAR(50)     NOT NULL,
  year          INTEGER         NOT NULL,
  price         DECIMAL(12,2)   NOT NULL,
  mileage       INTEGER         DEFAULT 0,
  color         VARCHAR(30),
  image_url     TEXT,
  available     BOOLEAN         DEFAULT true,
  created_at    TIMESTAMP       DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id                 SERIAL PRIMARY KEY,
  car_id             INTEGER         REFERENCES cars(id),
  buyer_name         VARCHAR(100)    NOT NULL,
  buyer_email        VARCHAR(100)    NOT NULL,
  purchase_price     DECIMAL(12,2)   NOT NULL,
  loan_amount        DECIMAL(12,2),
  down_payment       DECIMAL(12,2),
  monthly_payment    DECIMAL(12,2),
  loan_term_months   INTEGER,
  interest_rate      DECIMAL(5,2),
  credit_tier        VARCHAR(20),
  fraud_risk         VARCHAR(10),
  status             VARCHAR(20)     DEFAULT 'APPROVED',
  created_at         TIMESTAMP       DEFAULT NOW()
);

INSERT INTO cars (make, model, year, price, mileage, color, image_url) VALUES
  ('Toyota',   'Camry',    2024, 28000, 0,     'Silver', 'https://images.pexels.com/photos/34404246/pexels-photo-34404246.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('BMW',      '3 Series', 2023, 45000, 12000, 'Black',  'https://images.pexels.com/photos/3786091/pexels-photo-3786091.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Ford',     'Mustang',  2024, 38000, 0,     'Red',    'https://images.pexels.com/photos/34939819/pexels-photo-34939819.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Tesla',    'Model 3',  2024, 42000, 0,     'White',  'https://images.pexels.com/photos/9300916/pexels-photo-9300916.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Honda',    'Civic',    2023, 24000, 8000,  'Blue',   'https://images.pexels.com/photos/166054/pexels-photo-166054.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Mercedes', 'C-Class',  2023, 55000, 5000,  'Gray',   'https://images.pexels.com/photos/9791225/pexels-photo-9791225.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Audi',     'A4',       2024, 48000, 0,     'White',  'https://images.pexels.com/photos/9482560/pexels-photo-9482560.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Hyundai',  'Sonata',   2023, 26000, 15000, 'Blue',   'https://images.pexels.com/photos/712618/pexels-photo-712618.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Chevrolet', 'Camaro SS',         2024, 65000,  0,    'Yellow', 'https://images.pexels.com/photos/18776100/pexels-photo-18776100.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Dodge',     'Challenger R/T',    2023, 58000,  3000, 'Orange', 'https://images.pexels.com/photos/18426531/pexels-photo-18426531.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Porsche',   '911 Carrera',       2024, 115000, 0,    'Silver', 'https://images.pexels.com/photos/18948281/pexels-photo-18948281.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Nissan',    'GT-R',              2024, 125000, 0,    'Black',  'https://images.pexels.com/photos/33889816/pexels-photo-33889816.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Chevrolet', 'Corvette Stingray', 2024, 78000,  0,    'Red',    'https://images.pexels.com/photos/34911552/pexels-photo-34911552.jpeg?auto=compress&cs=tinysrgb&w=800')
ON CONFLICT DO NOTHING;
