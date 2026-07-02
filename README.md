# Car$ync

A car marketplace API with built-in auto-loan financing: credit checks, fraud
scoring, and loan amortization, on top of a simple cars/purchases catalog.

**Live:** https://d250nbw3be12j4.cloudfront.net

## Layout

```
backend/    Express API (Node 22)
frontend/   React (Vite) SPA
terraform/  Deploys everything into the shared CLOUD-OPS-project AWS infra
```

## Backend

### Local development

```
cd backend
npm install
npm run dev      # nodemon, in-memory data (no AWS needed)
```

Runs on `http://localhost:8080`. Without `DB_SECRET_ARN` set, it uses an
in-memory seed of 13 cars (sedans through muscle/sports cars) — no AWS
credentials or database required for local work. Copy `backend/.env.example`
to `.env` for the full list of variables.

`npm run migrate` seeds RDS from `db/schema.sql`. `npm run update-images` (via
`node src/update-images.js`) patches `image_url` on an already-seeded database
without re-inserting rows — used when photo URLs change after initial seed.

### Tests

```
cd backend
npm test          # node's built-in test runner (node --test)
```

Covers cars CRUD, the purchase flow (credit check + fraud detection +
loan amortization), and the standalone loan-calculator/credit-check tools.
Tests run against the in-memory data path only — no AWS/RDS required.

### API

| Method | Path                      | Description                                             |
|--------|---------------------------|----------------------------------------------------------|
| GET    | `/health`                 | Health check, reports DB connection state                |
| GET    | `/api/v1/cars`            | List cars (`?available=true&make=Toyota&maxPrice=40000`) |
| GET    | `/api/v1/cars/:id`        | Get a single car                                          |
| POST   | `/api/v1/cars`            | Add a car listing                                          |
| POST   | `/api/v1/purchases`       | Buy a car — runs credit check + fraud detection            |
| GET    | `/api/v1/purchases`       | List all purchases                                         |
| GET    | `/api/v1/purchases/:id`   | Get a single purchase                                       |
| POST   | `/api/v1/loan-calculator` | Calculate a monthly payment without buying                  |
| POST   | `/api/v1/credit-check`    | Run a standalone credit check                                |
| GET    | `/api/v1/summary`         | Platform inventory + sales summary                           |

Fraud scoring (`detectFraud` in `src/app.js`): flags a high loan amount
(>$80k), a down payment under 5% of price, or a down payment exceeding the
price. Score ≥50 blocks the purchase outright; ≥25 approves it as
`PENDING_REVIEW` instead of `APPROVED`.

### Database

Set `DB_SECRET_ARN` to a Secrets Manager secret ARN holding
`{host, port, dbname, username, password}` to run against RDS Postgres
instead of the in-memory fallback (see `terraform/modules/app/secrets.tf` for
how that secret gets created). Schema lives in `backend/db/schema.sql`; apply
it with:

```
npm run migrate     # requires DB_SECRET_ARN + AWS credentials in the environment
```

### Docker

```
cd backend
docker build -t fintech-payment-api .
docker run -p 8080:8080 fintech-payment-api
```

## Frontend

```
cd frontend
npm install
npm run dev      # http://localhost:5173, calls localhost:8080 (see .env.example)
```

Pages: `/` (marketing home with hero, animated stats, featured cars), `/about`,
`/browse` (the full filterable catalog), `/cars/:id` (detail + purchase flow),
`/loan-calculator`, `/purchases`, `/summary`. Cars render their real photo
(`CarPhoto` component) and fall back to a generated SVG illustration
(`CarIllustration`) if the photo URL ever fails to load — never a broken image.

React + Vite SPA using `HashRouter` (not `BrowserRouter`) — the app is served
from S3/CloudFront with no server-side routing, so a client route like
`/cars/1` is `/#/cars/1`; the server only ever sees `/`. This also avoids
needing a distribution-wide SPA-fallback rewrite, which would otherwise
clobber genuine API 404s.

In production, `VITE_API_BASE_URL` is empty (`frontend/.env.production`) —
API calls are relative (`/api/v1/...`) and go through the *same* CloudFront
distribution as the static assets, which proxies `/api/*` and `/health` to
the backend ALB over HTTP internally. The browser only ever talks to
CloudFront over HTTPS, so there's no mixed-content issue and no CORS needed
for the deployed frontend (it's same-origin). `ALLOWED_ORIGINS` on the
backend is still locked to the CloudFront origin as defense-in-depth against
anyone querying the ALB's public DNS name directly.

Deploying a new build:

```
cd frontend
npm run build
aws s3 sync dist/ s3://car-fintech-frontend-<account-id>/ --delete
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*"
```

(`terraform output frontend_bucket_name` / `frontend_cloudfront_distribution_id`.)

## Infrastructure

`terraform/` deploys this backend into the **existing shared AWS
infrastructure** from `CLOUD-OPS-project` — it does not create its own VPC,
subnets, or ECS cluster. It looks up the existing `myapp-vpc`, its subnets,
the `myapp-alb-sg` / `myapp-app-sg` / `myapp-rds-sg` security groups, and the
`cloudops-cluster` ECS cluster via Terraform `data` sources, and creates only
resources specific to this app:

- `car-fintech-postgres` RDS instance + KMS key
- `car-fintech/rds/credentials` Secrets Manager secret
- ECS execution/task IAM roles, task definition, and service
  (`car-fintech-api-service`) in the existing `cloudops-cluster`
- An ALB + target group + listener (none existed to attach to)
- A private S3 bucket + CloudFront distribution for the frontend (not
  VPC-scoped, so this is standalone regardless of the shared-infra pattern
  above) — same distribution also proxies `/api/*` and `/health` to the ALB

Deploys to the `fintech-payment-api` ECR repository.

### Deploying

```
# 1. Build and push the image
cd backend
docker build -t fintech-payment-api .
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker tag fintech-payment-api:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/fintech-payment-api:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/fintech-payment-api:latest

# 2. Set a real DB password (never commit this file)
cd ../terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars   # edit db_password

# 3. Apply
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# 4. Seed the schema (one-off ECS task, run once against a fresh DB)
aws ecs run-task --cluster cloudops-cluster --task-definition car-fintech-api \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[...private subnet ids...],securityGroups=[...app sg id...],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"car-fintech-api","command":["node","src/migrate.js"]}]}'
```

`terraform output alb_dns_name` gives the public URL once applied.

### NAT gateway cost control

The shared VPC's NAT gateways cost ~$65-70/month combined whether or not
anything's using them. If you're pausing work for a while, scripts in
`CLOUD-OPS-project/scripts/` (`nat-down.sh` / `nat-up.sh`) scale ECS services
to 0 and tear down / recreate just the NAT gateways + EIPs (via targeted
Terraform), without touching the VPC, RDS, or anything else in the shared
state. See that repo for details — never run a bare `terraform destroy` in
`CLOUD-OPS-project/environments/dev`, it would tear down the entire shared
VPC and RDS instance.
