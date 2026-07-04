# EKS + ArgoCD + Prometheus/Grafana Practice Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a session-scoped EKS cluster (separate Terraform state from the live ECS deployment) running ArgoCD-managed Kubernetes manifests for the existing backend plus a Prometheus/Grafana observability stack, with a realistic traffic generator, so app-level (Node.js GC/event-loop) and container-level (CPU throttling) metrics can be observed and correlated.

**Architecture:** New Terraform root (`terraform/environments/dev-eks/`) provisions an EKS cluster with a Fargate profile in the existing shared VPC. ArgoCD (Helm-bootstrapped) then GitOps-manages everything else from a `k8s/` folder: the backend Deployment (same ECR image ECS uses, now exposing `/metrics`), `kube-prometheus-stack` (Fargate-compatible values), and a load generator. No public ingress — access is via `kubectl port-forward` during a session.

**Tech Stack:** Terraform (`terraform-aws-modules/eks`), Helm, ArgoCD, Kustomize, `prom-client` (Node.js), `kube-prometheus-stack`, Node.js/`k6` for load generation.

## Global Constraints

- ECS/RDS/frontend (`terraform/environments/dev/`) must never be touched — this plan only ever creates a new, separate Terraform state (`terraform/environments/dev-eks/`).
- No public ALB/Ingress for anything created in this plan — ArgoCD, Grafana, Prometheus are reached via `kubectl port-forward` only.
- Reuse the existing ECR image (`fintech-payment-api`) and existing Secrets Manager secrets (`car-fintech/rds/credentials`, `car-fintech/admin-api-key`) — no new image build, no new secrets.
- All new Terraform must reference the existing shared VPC (`myapp-vpc`, subnet prefix `myapp-private-*`) via data sources only, matching the pattern in `terraform/modules/app/main.tf` — never create new VPC/subnet/NAT resources.
- Backend test command remains `npm test` (`node --test`) inside `backend/` — any new backend code needs a test using the existing `node:test` + `supertest` pattern (see `backend/test/cars.test.js`).
- AWS region is `us-east-1` throughout, matching all existing Terraform.

---

### Task 1: Backend — HTTP + Node.js runtime metrics endpoint

**Files:**
- Create: `backend/src/metrics.js`
- Modify: `backend/src/app.js:1-17` (require metrics module, add timing middleware, add `/metrics` route)
- Modify: `backend/package.json:13-18` (add `prom-client` dependency)
- Test: `backend/test/metrics.test.js`

**Interfaces:**
- Produces: `backend/src/metrics.js` exports `{ register, httpRequestDuration, purchasesTotal, creditChecksTotal, fraudChecksTotal }`. `register` is a `prom-client.Registry` instance whose `.metrics()` (async) returns the Prometheus text-exposition string, and `.contentType` is the correct `Content-Type` header value. `httpRequestDuration` is a `Histogram` with labels `{ method, route, status_code }`. `purchasesTotal` is a `Counter` with label `{ status }` (values: `DECLINED`, `BLOCKED`, `PENDING_REVIEW`, `APPROVED`). `creditChecksTotal` is a `Counter` with label `{ tier }`. `fraudChecksTotal` is a `Counter` with label `{ action }`.
- Consumes (Task 2): Task 2 imports `creditChecksTotal`, `fraudChecksTotal`, and `purchasesTotal` from this same file and calls `.inc(labels)` on them from within the purchases/credit-check route handlers.

- [ ] **Step 1: Add the `prom-client` dependency**

Edit `backend/package.json`, inside `"dependencies"` (currently lines 13-17):

```json
  "dependencies": {
    "@aws-sdk/client-secrets-manager": "^3.600.0",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "prom-client": "^15.1.0"
  },
```

Run: `cd backend && npm install`
Expected: `prom-client` added to `node_modules` and `package-lock.json` updated, no errors.

- [ ] **Step 2: Write the failing test for the `/metrics` route**

Create `backend/test/metrics.test.js`:

```js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/app');

describe('GET /metrics', () => {
  test('exposes Prometheus-formatted metrics', async () => {
    const res = await request(app).get('/metrics');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/plain/);
    assert.match(res.text, /^# HELP/m);
    assert.match(res.text, /nodejs_eventloop_lag_seconds/);
    assert.match(res.text, /nodejs_gc_duration_seconds/);
  });

  test('records HTTP request duration for a real request', async () => {
    await request(app).get('/api/v1/cars');
    const res = await request(app).get('/metrics');
    assert.match(res.text, /http_request_duration_seconds_count\{[^}]*route="\/api\/v1\/cars"[^}]*\}/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npm test -- --test-name-pattern="metrics"`
Expected: FAIL — `GET /metrics` returns 404 (route doesn't exist yet).

- [ ] **Step 4: Create the metrics module**

Create `backend/src/metrics.js`:

```js
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const purchasesTotal = new client.Counter({
  name: 'purchases_total',
  help: 'Total purchase attempts by final status',
  labelNames: ['status'],
  registers: [register],
});

const creditChecksTotal = new client.Counter({
  name: 'credit_checks_total',
  help: 'Total credit checks by resulting tier',
  labelNames: ['tier'],
  registers: [register],
});

const fraudChecksTotal = new client.Counter({
  name: 'fraud_checks_total',
  help: 'Total fraud checks by action taken',
  labelNames: ['action'],
  registers: [register],
});

module.exports = { register, httpRequestDuration, purchasesTotal, creditChecksTotal, fraudChecksTotal };
```

- [ ] **Step 5: Wire the timing middleware and `/metrics` route into `app.js`**

Modify `backend/src/app.js`. Add the require near the top (after the existing requires, `backend/src/app.js:1-4`):

```js
const express = require('express');
const cors = require('cors');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');
const { register, httpRequestDuration, purchasesTotal, creditChecksTotal, fraudChecksTotal } = require('./metrics');
```

Add timing middleware right after `app.use(express.json());` (currently `backend/src/app.js:16`):

```js
app.use(express.json());

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route ? req.route.path : req.path;
    httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, durationSeconds);
  });
  next();
});
```

Add the `/metrics` route right after the `/health` route (currently `backend/src/app.js:162-168`):

```js
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: pool ? 'connected' : 'in-memory',
  });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && npm test -- --test-name-pattern="metrics"`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the full backend suite to check for regressions**

Run: `cd backend && npm test`
Expected: All tests pass (29 pre-existing + 2 new = 31).

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/metrics.js backend/src/app.js backend/test/metrics.test.js
git commit -m "Add Prometheus /metrics endpoint with HTTP + Node.js runtime metrics"
```

---

### Task 2: Backend — business metrics on the purchases/credit-check flow

**Files:**
- Modify: `backend/src/app.js:274-327` (purchases handler — instrument credit/fraud/status outcomes)
- Modify: `backend/src/app.js:410-414` (standalone credit-check route)
- Test: `backend/test/metrics.test.js` (extend)

**Interfaces:**
- Consumes: `creditChecksTotal`, `fraudChecksTotal`, `purchasesTotal` from `backend/src/metrics.js` (Task 1).
- Produces: nothing new consumed by later tasks — this is the last backend code task before infra.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test/metrics.test.js`:

```js
describe('GET /metrics — business counters', () => {
  test('counts a declined credit check', async () => {
    const before = (await request(app).get('/metrics')).text;
    await request(app).post('/api/v1/purchases').send({
      carId: 999999, buyerName: 'Jane', buyerEmail: 'jane@example.com', creditScore: 500,
    });
    // carId is bogus so this 404s before credit check runs; use credit-check route instead
    await request(app).post('/api/v1/credit-check').send({ creditScore: 500 });
    const after = (await request(app).get('/metrics')).text;
    assert.match(after, /credit_checks_total\{tier="DECLINED"\}/);
    assert.notEqual(before, after);
  });

  test('counts an approved purchase', async () => {
    const car = await request(app)
      .post('/api/v1/cars')
      .set('X-Admin-Key', (process.env.ADMIN_API_KEY = 'metrics-test-key'))
      .send({ make: 'Test', model: 'MetricsCar', year: 2024, price: 30000 });
    await request(app).post('/api/v1/purchases').send({
      carId: car.body.id, buyerName: 'Jane', buyerEmail: 'jane@example.com', creditScore: 750,
    });
    delete process.env.ADMIN_API_KEY;
    const res = await request(app).get('/metrics');
    assert.match(res.text, /purchases_total\{status="APPROVED"\}/);
    assert.match(res.text, /fraud_checks_total\{action="APPROVE"\}/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npm test -- --test-name-pattern="business counters"`
Expected: FAIL — counters never reach a value >0 (no `.inc()` calls exist yet), `assert.match` fails to find the label.

- [ ] **Step 3: Instrument the purchases handler**

Modify `backend/src/app.js:273-295` (credit check → fraud check → status determination):

```js
    // Credit check
    const credit = checkCredit(Number(creditScore));
    creditChecksTotal.inc({ tier: credit.tier });
    if (!credit.approved) {
      purchasesTotal.inc({ status: 'DECLINED' });
      return res.status(400).json({
        error: 'Credit application declined',
        creditTier: credit.tier,
        message: 'Minimum credit score of 600 required',
      });
    }

    // Fraud check
    const fraud = detectFraud({ loanAmount, downPayment: down, purchasePrice });
    fraudChecksTotal.inc({ action: fraud.action });
    if (fraud.action === 'BLOCK') {
      purchasesTotal.inc({ status: 'BLOCKED' });
      return res.status(400).json({
        error: 'Transaction blocked by fraud detection',
        flags: fraud.flags,
        fraudScore: fraud.score,
      });
    }

    const monthlyPayment = calculateMonthlyPayment(loanAmount, credit.interestRate, Number(loanTermMonths));
    const totalCost      = Number((monthlyPayment * Number(loanTermMonths) + down).toFixed(2));
    const status         = fraud.action === 'REVIEW' ? 'PENDING_REVIEW' : 'APPROVED';
    purchasesTotal.inc({ status });
```

- [ ] **Step 4: Instrument the standalone credit-check route**

Modify `backend/src/app.js:410-414`:

```js
app.post('/api/v1/credit-check', (req, res) => {
  const { creditScore } = req.body;
  if (!creditScore) return res.status(400).json({ error: 'creditScore is required' });
  const result = checkCredit(Number(creditScore));
  creditChecksTotal.inc({ tier: result.tier });
  res.json(result);
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npm test -- --test-name-pattern="business counters"`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: All 33 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/app.js backend/test/metrics.test.js
git commit -m "Instrument purchases/credit-check flow with business metrics counters"
```

---

### Task 3: Terraform — EKS cluster + Fargate profile module

**Files:**
- Create: `terraform/modules/eks/main.tf`
- Create: `terraform/modules/eks/variables.tf`
- Create: `terraform/modules/eks/outputs.tf`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first infra task).
- Produces: outputs `cluster_name`, `cluster_endpoint`, `cluster_certificate_authority_data`, `oidc_provider_arn`, `cluster_oidc_issuer_url` — Task 4 (IRSA) and Task 5 (environment root) consume these exact output names.

- [ ] **Step 1: Write the module's variables**

Create `terraform/modules/eks/variables.tf`:

```hcl
# modules/eks/variables.tf

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "car-fintech-eks"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.30"
}

variable "vpc_name" {
  description = "Name tag of the existing shared VPC to deploy into"
  type        = string
  default     = "myapp-vpc"
}

variable "vpc_name_prefix" {
  description = "Name-tag prefix used by the existing VPC's subnets"
  type        = string
  default     = "myapp"
}

variable "fargate_namespaces" {
  description = "Kubernetes namespaces scheduled onto Fargate"
  type        = list(string)
  default     = ["argocd", "backend", "monitoring", "kube-system"]
}
```

- [ ] **Step 2: Write the module's main resources**

Create `terraform/modules/eks/main.tf`. This mirrors the existing data-source-only pattern from `terraform/modules/app/main.tf` — no new VPC/subnets are created, only looked up:

```hcl
# modules/eks/main.tf
#
# EKS cluster + Fargate profile for the session-scoped monitoring/GitOps
# practice environment. Deploys into the EXISTING shared VPC (myapp-vpc) —
# no new VPC/subnets/NAT, same pattern as modules/app.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_vpc" "existing" {
  filter {
    name   = "tag:Name"
    values = [var.vpc_name]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.existing.id]
  }
  filter {
    name   = "tag:Name"
    values = ["${var.vpc_name_prefix}-private-*"]
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.kubernetes_version

  vpc_id     = data.aws_vpc.existing.id
  subnet_ids = data.aws_subnets.private.ids

  cluster_endpoint_public_access = true

  fargate_profiles = {
    default = {
      name = "default"
      selectors = [
        for ns in var.fargate_namespaces : { namespace = ns }
      ]
    }
  }

  enable_cluster_creator_admin_permissions = true

  tags = {
    Project = "car-fintech"
    Purpose = "eks-monitoring-practice"
  }
}
```

Run: `cd terraform/modules/eks && terraform init -backend=false && terraform validate`
Expected: `Success! The configuration is valid.` (Verify the `terraform-aws-modules/eks/aws` `~> 20.0` constraint and the exact argument names above against the current Terraform Registry page before applying for real — module APIs shift between major versions faster than most; if `terraform init` pulls a version whose docs show different argument names than used here, update this file to match before proceeding.)

- [ ] **Step 3: Write the module's outputs**

Create `terraform/modules/eks/outputs.tf`:

```hcl
# modules/eks/outputs.tf

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  value = module.eks.cluster_certificate_authority_data
}

output "oidc_provider_arn" {
  value = module.eks.oidc_provider_arn
}

output "cluster_oidc_issuer_url" {
  value = module.eks.cluster_oidc_issuer_url
}
```

Run: `cd terraform/modules/eks && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
git add terraform/modules/eks/
git commit -m "Add EKS cluster + Fargate profile Terraform module"
```

---

### Task 4: Terraform — IRSA role for the backend service account

**Files:**
- Create: `terraform/modules/eks/irsa.tf`
- Modify: `terraform/modules/eks/outputs.tf` (add `backend_irsa_role_arn` output)

**Interfaces:**
- Consumes: `module.eks.oidc_provider_arn`, `module.eks.cluster_oidc_issuer_url` (from Task 3, same file scope).
- Produces: output `backend_irsa_role_arn` — Task 6 (backend Kustomize manifests) annotates the backend `ServiceAccount` with this exact ARN via `eks.amazonaws.com/role-arn`.

- [ ] **Step 1: Look up the existing secrets by name (same names ECS already uses)**

Create `terraform/modules/eks/irsa.tf`:

```hcl
# modules/eks/irsa.tf
#
# IRSA (IAM Roles for Service Accounts) role for the backend pod running on
# Fargate — the Fargate-compatible equivalent of car-fintech's existing ECS
# task role (terraform/modules/app/secrets.tf), granting read access to the
# SAME two Secrets Manager secrets ECS already uses. No new secrets created.

data "aws_secretsmanager_secret" "rds_credentials" {
  name = "car-fintech/rds/credentials"
}

data "aws_secretsmanager_secret" "admin_api_key" {
  name = "car-fintech/admin-api-key"
}

module "backend_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "car-fintech-eks-backend-irsa"

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["backend:backend"]
    }
  }

  role_policy_arns = {
    read_secrets = aws_iam_policy.backend_read_secrets.arn
  }
}

resource "aws_iam_policy" "backend_read_secrets" {
  name        = "car-fintech-eks-backend-read-secrets"
  description = "Allows the EKS-hosted backend pod to read the same secrets ECS uses"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = [
          data.aws_secretsmanager_secret.rds_credentials.arn,
          data.aws_secretsmanager_secret.admin_api_key.arn,
        ]
      }
    ]
  })
}
```

- [ ] **Step 2: Add the output**

Modify `terraform/modules/eks/outputs.tf`, append:

```hcl
output "backend_irsa_role_arn" {
  value = module.backend_irsa.iam_role_arn
}
```

- [ ] **Step 3: Validate**

Run: `cd terraform/modules/eks && terraform validate`
Expected: `Success! The configuration is valid.` (As in Task 3 Step 2, confirm `iam-role-for-service-accounts-eks`'s current input/output names against the Registry before the real apply — `namespace_service_accounts` format in particular has changed across major versions of this module.)

- [ ] **Step 4: Commit**

```bash
git add terraform/modules/eks/irsa.tf terraform/modules/eks/outputs.tf
git commit -m "Add IRSA role for the EKS-hosted backend service account"
```

---

### Task 5: Terraform — dev-eks environment root, apply, and verify the cluster

**Files:**
- Create: `terraform/environments/dev-eks/main.tf`
- Create: `terraform/environments/dev-eks/variables.tf`
- Create: `terraform/environments/dev-eks/outputs.tf`

**Interfaces:**
- Consumes: `terraform/modules/eks` (Task 3 + Task 4) — all its outputs.
- Produces: a live EKS cluster reachable via `kubectl` — Task 6 (ArgoCD bootstrap) depends on this cluster existing and `kubeconfig` being updated.

- [ ] **Step 1: Write the environment root**

Create `terraform/environments/dev-eks/main.tf`:

```hcl
# environments/dev-eks/main.tf
#
# Separate Terraform state from environments/dev on purpose: this stack's
# terraform destroy must never be able to affect the live ECS/RDS/frontend
# deployment. This is the ephemeral EKS practice environment only.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "eks" {
  source = "../../modules/eks"

  cluster_name        = var.cluster_name
  kubernetes_version   = var.kubernetes_version
  vpc_name             = var.vpc_name
  vpc_name_prefix       = var.vpc_name_prefix
}
```

Create `terraform/environments/dev-eks/variables.tf`:

```hcl
# environments/dev-eks/variables.tf

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "cluster_name" {
  type    = string
  default = "car-fintech-eks"
}

variable "kubernetes_version" {
  type    = string
  default = "1.30"
}

variable "vpc_name" {
  type    = string
  default = "myapp-vpc"
}

variable "vpc_name_prefix" {
  type    = string
  default = "myapp"
}
```

Create `terraform/environments/dev-eks/outputs.tf`:

```hcl
# environments/dev-eks/outputs.tf

output "cluster_name" {
  value = module.eks.cluster_name
}

output "backend_irsa_role_arn" {
  value = module.eks.backend_irsa_role_arn
}
```

- [ ] **Step 2: Initialize and validate**

Run: `cd terraform/environments/dev-eks && terraform init && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 3: Plan and review**

Run: `cd terraform/environments/dev-eks && terraform plan -out=tfplan`
Expected: plan shows creation of the EKS cluster, Fargate profile, OIDC provider, and IRSA IAM role/policy — no changes to any other Terraform state (confirm zero resources from `environments/dev` appear).

- [ ] **Step 4: Apply**

Run: `cd terraform/environments/dev-eks && terraform apply tfplan`
Expected: apply completes successfully (EKS cluster creation typically takes 10-15 minutes).

- [ ] **Step 5: Update local kubeconfig and verify the cluster**

Run:
```bash
aws eks update-kubeconfig --name car-fintech-eks --region us-east-1
kubectl get nodes
kubectl get fargateprofile -n kube-system 2>/dev/null; aws eks list-fargate-profiles --cluster-name car-fintech-eks --region us-east-1
```
Expected: `kubectl get nodes` lists Fargate virtual nodes once a pod is scheduled (may be empty until Task 6 schedules the first pod — that's fine, the cluster itself being reachable is what this step confirms); `aws eks list-fargate-profiles` shows the `default` profile with namespaces `argocd`, `backend`, `monitoring`, `kube-system`.

- [ ] **Step 6: Commit**

```bash
git add terraform/environments/dev-eks/
git commit -m "Add dev-eks Terraform environment and provision the EKS cluster"
```

---

### Task 6: ArgoCD bootstrap + app-of-apps root

**Files:**
- Create: `k8s/bootstrap/README.md`
- Create: `k8s/bootstrap/root-app.yaml`

**Interfaces:**
- Consumes: live cluster from Task 5 (`kubectl` already configured against `car-fintech-eks`).
- Produces: a running ArgoCD instance that watches `k8s/apps/` — Task 7 and Task 8 both add directories under `k8s/apps/` that ArgoCD picks up automatically once committed and pushed, no manual `kubectl apply` needed for those tasks.

- [ ] **Step 1: Install ArgoCD via Helm**

Run:
```bash
kubectl create namespace argocd
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
helm install argocd argo/argo-cd --namespace argocd --version 7.7.3
```
Expected: Helm reports `STATUS: deployed`.

- [ ] **Step 2: Verify ArgoCD pods come up**

Run: `kubectl get pods -n argocd --watch`
Expected: all pods (`argocd-server`, `argocd-repo-server`, `argocd-application-controller`, `argocd-redis`, `argocd-dex-server`) reach `Running`/`1/1 Ready` within a few minutes. Ctrl-C once stable.

- [ ] **Step 3: Retrieve the initial admin password and confirm UI access**

Run:
```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
kubectl port-forward svc/argocd-server -n argocd 8080:443
```
Then open `https://localhost:8080` in a browser, log in as `admin` with the password printed above.
Expected: ArgoCD UI loads and logs in successfully. Stop the port-forward (Ctrl-C) once confirmed.

- [ ] **Step 4: Write the app-of-apps root Application manifest**

Create `k8s/bootstrap/root-app.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: car-fintech-apps
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/uwakweobed89-png/Car-Fintech-webapp-Project-.git
    targetRevision: master
    path: k8s/apps
    directory:
      recurse: true
  destination:
    server: https://kubernetes.default.svc
  syncPolicy:
    automated:
      selfHeal: true
      prune: true
    syncOptions:
      - CreateNamespace=true
```

Create `k8s/bootstrap/README.md`:

```markdown
# ArgoCD bootstrap

One-time, manual steps to stand up ArgoCD itself (it can't be GitOps-managed
before it exists). After this, everything under `k8s/apps/` is managed
automatically — commit and push, ArgoCD picks it up.

1. `kubectl create namespace argocd`
2. `helm repo add argo https://argoproj.github.io/argo-helm && helm repo update`
3. `helm install argocd argo/argo-cd --namespace argocd --version 7.7.3`
4. `kubectl apply -f k8s/bootstrap/root-app.yaml`
5. Get the initial admin password:
   `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d`
6. Access the UI: `kubectl port-forward svc/argocd-server -n argocd 8080:443`, browse to `https://localhost:8080`.

Teardown: delete the `argocd`, `backend`, and `monitoring` namespaces before
`terraform destroy` in `terraform/environments/dev-eks/` (see the root
`k8s/RUNBOOK.md` from Task 9 for the full sequence).
```

- [ ] **Step 5: Apply the root Application (this repo's remote must be reachable from the cluster's network — public GitHub repo, no auth needed)**

Run: `kubectl apply -f k8s/bootstrap/root-app.yaml`
Expected: `application.argoproj.io/car-fintech-apps created`. At this point `k8s/apps/` doesn't exist yet (created in Tasks 7-8), so ArgoCD will show the app as `OutOfSync`/`Missing` — that's expected until this commit is pushed and Task 7 adds content.

- [ ] **Step 6: Commit and push (required — ArgoCD reads from the pushed `master` branch, not local files)**

```bash
git add k8s/bootstrap/
git commit -m "Add ArgoCD bootstrap and app-of-apps root Application"
git push origin master
```

- [ ] **Step 7: Re-check sync status**

Run: `kubectl port-forward svc/argocd-server -n argocd 8080:443` and check the `car-fintech-apps` Application in the UI, or:
```bash
kubectl get application car-fintech-apps -n argocd -o jsonpath="{.status.sync.status}"
```
Expected: `Synced` once `k8s/apps/` exists with valid manifests (will still show `OutOfSync`/error until Task 7 is committed — that's expected at this point in the plan, not a failure of this task).

---

### Task 7: Backend Kustomize manifests (ArgoCD-managed)

**Files:**
- Create: `k8s/apps/backend/namespace.yaml`
- Create: `k8s/apps/backend/serviceaccount.yaml`
- Create: `k8s/apps/backend/deployment.yaml`
- Create: `k8s/apps/backend/service.yaml`
- Create: `k8s/apps/backend/kustomization.yaml`
- Create: `k8s/apps/backend/application.yaml`

**Interfaces:**
- Consumes: `backend_irsa_role_arn` Terraform output (Task 5) — pasted as a literal value into `serviceaccount.yaml`'s annotation (this is a static value once the cluster is created; Terraform and Kubernetes manifests aren't wired together automatically in this design — see the note in Step 2).
- Produces: a `Service` named `backend` in the `backend` namespace, port 8080 — Task 8's `ServiceMonitor` selects this Service by its labels (`app: backend`) to scrape `/metrics`.

- [ ] **Step 1: Get the IRSA role ARN from Terraform**

Run: `cd terraform/environments/dev-eks && terraform output backend_irsa_role_arn`
Expected: prints an ARN like `arn:aws:iam::<account-id>:role/car-fintech-eks-backend-irsa`. Copy this value for Step 2.

- [ ] **Step 2: Write the namespace and service account**

Create `k8s/apps/backend/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: backend
```

Create `k8s/apps/backend/serviceaccount.yaml` — replace `<BACKEND_IRSA_ROLE_ARN>` with the value from Step 1:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: backend
  namespace: backend
  annotations:
    eks.amazonaws.com/role-arn: <BACKEND_IRSA_ROLE_ARN>
```

- [ ] **Step 3: Write the Deployment**

Get the current ECR image URI first: `cd terraform/environments/dev && terraform output` (or `aws ecr describe-repositories --repository-names fintech-payment-api --region us-east-1` for the repository URI, then use whatever tag ECS is currently running — check `aws ecs describe-task-definition --task-definition car-fintech-api` for the exact `image` value ECS uses today, and use that same value here so both platforms run the identical build).

Create `k8s/apps/backend/deployment.yaml` (replace `<ECR_IMAGE_URI>` with the value found above):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: backend
  labels:
    app: backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      serviceAccountName: backend
      containers:
        - name: backend
          image: <ECR_IMAGE_URI>
          ports:
            - containerPort: 8080
          env:
            - name: DB_SECRET_ARN
              value: "arn:aws:secretsmanager:us-east-1:PLACEHOLDER_FILLED_IN_STEP_1:secret:car-fintech/rds/credentials"
            - name: AWS_REGION
              value: "us-east-1"
            - name: ALLOWED_ORIGINS
              value: ""
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 20
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
```

Note on `DB_SECRET_ARN`: run `aws secretsmanager describe-secret --secret-id car-fintech/rds/credentials --region us-east-1 --query ARN --output text` and replace the placeholder value above with the real ARN it prints (same secret ECS already reads — this just needs the exact ARN string, account ID included).

- [ ] **Step 4: Write the Service**

Create `k8s/apps/backend/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: backend
  labels:
    app: backend
spec:
  selector:
    app: backend
  ports:
    - port: 8080
      targetPort: 8080
      name: http
```

- [ ] **Step 5: Write the Kustomize base and ArgoCD Application**

Create `k8s/apps/backend/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - serviceaccount.yaml
  - deployment.yaml
  - service.yaml
```

Create `k8s/apps/backend/application.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: backend
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/uwakweobed89-png/Car-Fintech-webapp-Project-.git
    targetRevision: master
    path: k8s/apps/backend
  destination:
    server: https://kubernetes.default.svc
    namespace: backend
  syncPolicy:
    automated:
      selfHeal: true
      prune: true
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 6: Commit and push**

```bash
git add k8s/apps/backend/
git commit -m "Add ArgoCD-managed backend Deployment/Service manifests"
git push origin master
```

- [ ] **Step 7: Verify ArgoCD synced and the pod is healthy**

Run:
```bash
kubectl get application backend -n argocd -o jsonpath="{.status.sync.status} {.status.health.status}"
kubectl get pods -n backend
```
Expected: `Synced Healthy`, and the backend pod shows `1/1 Running`.

- [ ] **Step 8: Verify `/health` and `/metrics` respond**

Run:
```bash
kubectl port-forward svc/backend -n backend 8080:8080
```
In another terminal:
```bash
curl http://localhost:8080/health
curl http://localhost:8080/metrics | head -20
```
Expected: `/health` returns `{"status":"healthy",...}`; `/metrics` returns Prometheus text format starting with `# HELP` lines. Stop the port-forward once confirmed.

---

### Task 8: Monitoring stack — kube-prometheus-stack via ArgoCD

**Files:**
- Create: `k8s/apps/monitoring/kustomization.yaml`
- Create: `k8s/apps/monitoring/values.yaml`
- Create: `k8s/apps/monitoring/application.yaml`
- Create: `k8s/apps/monitoring/servicemonitor.yaml`
- Create: `k8s/apps/monitoring/dashboards/car-fintech-dashboard.yaml`

**Interfaces:**
- Consumes: `backend` Service (Task 7) — the `ServiceMonitor` selects it by `app: backend` label on port name `http`.
- Produces: nothing consumed by later tasks in this plan — Task 9 (load generator) is independent infra, verified against this task's Grafana/Prometheus, not against a code interface.

- [ ] **Step 1: Write the Fargate-compatible Helm values override**

Create `k8s/apps/monitoring/values.yaml`:

```yaml
# Fargate has no visible nodes for a DaemonSet to run on — disable it.
nodeExporter:
  enabled: false

prometheus:
  prometheusSpec:
    resources:
      requests:
        cpu: 250m
        memory: 512Mi
      limits:
        cpu: 500m
        memory: 1Gi
    serviceMonitorSelectorNilUsesHelmValues: false

grafana:
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 200m
      memory: 256Mi
  service:
    type: ClusterIP
  sidecar:
    dashboards:
      enabled: true
      label: grafana_dashboard
      searchNamespace: monitoring

alertmanager:
  alertmanagerSpec:
    resources:
      requests:
        cpu: 50m
        memory: 64Mi
```

- [ ] **Step 2: Write the ArgoCD Application for the Helm chart**

Create `k8s/apps/monitoring/application.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: monitoring
  namespace: argocd
spec:
  project: default
  sources:
    - repoURL: https://prometheus-community.github.io/helm-charts
      chart: kube-prometheus-stack
      targetRevision: 65.5.1
      helm:
        valueFiles:
          - $values/k8s/apps/monitoring/values.yaml
    - repoURL: https://github.com/uwakweobed89-png/Car-Fintech-webapp-Project-.git
      targetRevision: master
      ref: values
  destination:
    server: https://kubernetes.default.svc
    namespace: monitoring
  syncPolicy:
    automated:
      selfHeal: true
      prune: true
    syncOptions:
      - CreateNamespace=true
```

- [ ] **Step 3: Write the ServiceMonitor for the backend**

Create `k8s/apps/monitoring/servicemonitor.yaml`:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend
  namespace: monitoring
  labels:
    release: monitoring
spec:
  namespaceSelector:
    matchNames:
      - backend
  selector:
    matchLabels:
      app: backend
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

- [ ] **Step 4: Write the provisioned Grafana dashboard**

Create `k8s/apps/monitoring/dashboards/car-fintech-dashboard.yaml` — a ConfigMap Grafana's sidecar auto-loads (matched by the `grafana_dashboard` label set in `values.yaml` Step 1):

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: car-fintech-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "true"
data:
  car-fintech-dashboard.json: |
    {
      "title": "Car$ync — Backend Metrics",
      "timezone": "browser",
      "panels": [
        {
          "id": 1,
          "title": "HTTP request rate by route",
          "type": "timeseries",
          "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
          "targets": [
            { "expr": "sum(rate(http_request_duration_seconds_count[1m])) by (route)" }
          ]
        },
        {
          "id": 2,
          "title": "Purchases by outcome",
          "type": "timeseries",
          "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
          "targets": [
            { "expr": "sum(rate(purchases_total[1m])) by (status)" }
          ]
        },
        {
          "id": 3,
          "title": "Node.js event loop lag",
          "type": "timeseries",
          "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
          "targets": [
            { "expr": "nodejs_eventloop_lag_seconds" }
          ]
        },
        {
          "id": 4,
          "title": "Node.js GC duration",
          "type": "timeseries",
          "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
          "targets": [
            { "expr": "rate(nodejs_gc_duration_seconds_sum[1m])" }
          ]
        },
        {
          "id": 5,
          "title": "Container CPU throttling (backend pod)",
          "type": "timeseries",
          "gridPos": { "h": 8, "w": 24, "x": 0, "y": 16 },
          "targets": [
            { "expr": "rate(container_cpu_cfs_throttled_periods_total{namespace=\"backend\"}[5m])" }
          ]
        }
      ]
    }
```

- [ ] **Step 5: Write the Kustomization**

Create `k8s/apps/monitoring/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - servicemonitor.yaml
  - dashboards/car-fintech-dashboard.yaml
```

(`application.yaml` is applied to the `argocd` namespace directly by the app-of-apps root, same as `k8s/apps/backend/application.yaml` — it is not part of this Kustomization, which targets the `monitoring` namespace resources only.)

- [ ] **Step 6: Commit and push**

```bash
git add k8s/apps/monitoring/
git commit -m "Add ArgoCD-managed kube-prometheus-stack with Fargate-compatible values"
git push origin master
```

- [ ] **Step 7: Verify the stack syncs and comes up**

Run:
```bash
kubectl get application monitoring -n argocd -o jsonpath="{.status.sync.status} {.status.health.status}"
kubectl get pods -n monitoring --watch
```
Expected: `Synced Healthy`; Prometheus, Grafana, Alertmanager, and kube-state-metrics pods reach `Running` (no node-exporter pods — disabled in Step 1). Ctrl-C once stable.

- [ ] **Step 8: Verify Prometheus is scraping the backend**

Run: `kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090`
Open `http://localhost:9090/targets` in a browser.
Expected: a target for the `backend` `ServiceMonitor` shows state `UP`. Stop the port-forward once confirmed.

- [ ] **Step 9: Verify the Grafana dashboard renders**

Run:
```bash
kubectl get secret -n monitoring monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 -d
kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80
```
Open `http://localhost:3000`, log in as `admin` with the password printed above, find the "Car$ync — Backend Metrics" dashboard.
Expected: dashboard loads with all 5 panels (graphs will be flat/empty until Task 9's load generator runs — that's expected). Stop the port-forward once confirmed.

---

### Task 9: Load generator for realistic traffic

**Files:**
- Create: `k8s/load-generator/generate-traffic.js`
- Create: `k8s/load-generator/package.json`
- Create: `k8s/load-generator/README.md`

**Interfaces:**
- Consumes: `backend` Service (Task 7) — hits it at `http://backend.backend.svc.cluster.local:8080` when run as an in-cluster Job, or `http://localhost:8080` when run against a port-forward from a workstation.
- Produces: nothing consumed by later tasks — this is a standalone script, run manually during a session.

- [ ] **Step 1: Write the traffic-generation script**

Create `k8s/load-generator/generate-traffic.js`:

```js
// Drives realistic traffic against the backend so Prometheus/Grafana have
// real, varying data instead of flat empty graphs. Run against a
// port-forwarded backend Service (see README) or in-cluster as a Job.

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8080';

const CREDIT_SCORES = [800, 750, 700, 650, 600, 550]; // spans EXCELLENT..DECLINED
const DOWN_PAYMENT_FRACTIONS = [0.2, 0.05, 0.01, 1.5]; // normal, low, very low (REVIEW), exceeds price (BLOCK)

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function browseCars() {
  const res = await fetch(`${BASE_URL}/api/v1/cars`);
  const body = await res.json();
  return body.cars;
}

async function attemptPurchase(car) {
  const creditScore = randomFrom(CREDIT_SCORES);
  const downPayment = Math.round(car.price * randomFrom(DOWN_PAYMENT_FRACTIONS));
  await fetch(`${BASE_URL}/api/v1/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      carId: car.id,
      buyerName: 'Load Test Buyer',
      buyerEmail: 'loadtest@example.com',
      creditScore,
      downPayment,
    }),
  });
}

async function tick() {
  try {
    const cars = await browseCars();
    if (cars.length) {
      await attemptPurchase(randomFrom(cars));
    }
    await fetch(`${BASE_URL}/api/v1/summary`);
  } catch (err) {
    console.error('tick failed:', err.message);
  }
}

async function main() {
  console.log(`Generating traffic against ${BASE_URL} — Ctrl-C to stop`);
  setInterval(tick, 1000);
}

main();
```

- [ ] **Step 2: Write the package manifest**

Create `k8s/load-generator/package.json`:

```json
{
  "name": "car-fintech-load-generator",
  "version": "1.0.0",
  "private": true,
  "description": "Drives realistic traffic against the backend for the EKS/Prometheus/Grafana practice environment",
  "main": "generate-traffic.js",
  "scripts": {
    "start": "node generate-traffic.js"
  }
}
```

- [ ] **Step 3: Write the README**

Create `k8s/load-generator/README.md`:

```markdown
# Load generator

Drives realistic traffic (browsing cars, submitting purchases with varying
credit scores and down payments) against the backend so the Grafana
dashboard in `k8s/apps/monitoring/` has real, varying data to show instead
of flat empty graphs.

## Usage

1. Port-forward the backend Service:
   `kubectl port-forward svc/backend -n backend 8080:8080`
2. In another terminal:
   `cd k8s/load-generator && BACKEND_URL=http://localhost:8080 npm start`
3. Watch the Grafana dashboard update in near-real-time.
4. Stop with Ctrl-C when done — verify the dashboard's graphs flatten out
   again shortly after, confirming the data was live, not static.
```

- [ ] **Step 4: Run it and verify traffic reaches the backend**

Run (in one terminal): `kubectl port-forward svc/backend -n backend 8080:8080`
Run (in another terminal): `cd k8s/load-generator && BACKEND_URL=http://localhost:8080 npm start`
Let it run for ~30 seconds, then Ctrl-C.
Expected: no repeated `tick failed` errors in the output (occasional ones are fine — e.g. a car becoming unavailable mid-run).

- [ ] **Step 5: Verify the Grafana dashboard now shows non-flat data**

With the load generator running, re-open the Grafana dashboard from Task 8 Step 9.
Expected: "HTTP request rate by route", "Purchases by outcome", and "Node.js event loop lag" panels show non-zero, moving lines. Stop the load generator, wait ~1 minute, confirm the lines flatten toward zero again.

- [ ] **Step 6: Commit**

```bash
git add k8s/load-generator/
git commit -m "Add load generator for realistic traffic in the monitoring practice environment"
```

---

### Task 10: Runbook — verification checklist and teardown sequence

**Files:**
- Create: `k8s/RUNBOOK.md`

**Interfaces:**
- Consumes: nothing — this is a documentation-only task summarizing verification/teardown steps already exercised in Tasks 5-9.
- Produces: nothing consumed by other tasks — this is the last task in the plan.

- [ ] **Step 1: Write the runbook**

Create `k8s/RUNBOOK.md`:

```markdown
# EKS + ArgoCD + Prometheus/Grafana practice environment — runbook

Session-scoped: stand up, use, tear down. The ECS/RDS/frontend deployment
(the actual live app) is never touched by any step here — this cluster is
entirely separate infrastructure.

## Stand up

1. `cd terraform/environments/dev-eks && terraform init && terraform apply`
2. `aws eks update-kubeconfig --name car-fintech-eks --region us-east-1`
3. Bootstrap ArgoCD: follow `k8s/bootstrap/README.md`
4. Wait for ArgoCD to sync `backend` and `monitoring` Applications:
   `kubectl get applications -n argocd`
   — both should show `Synced`/`Healthy` within a few minutes of the
   root Application being applied (they're driven from the `k8s/apps/`
   folder already committed to `master`, no manual apply needed per-app).

## Verify

1. `kubectl get pods -A` — argocd, backend, and monitoring namespaces all
   `Running`.
2. Backend health: `kubectl port-forward svc/backend -n backend 8080:8080`,
   then `curl http://localhost:8080/health`.
3. Prometheus target health:
   `kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090`,
   check `http://localhost:9090/targets` — backend target `UP`.
4. Grafana dashboard:
   `kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80`,
   open `http://localhost:3000`, view "Car$ync — Backend Metrics".
5. Generate real traffic: `cd k8s/load-generator && BACKEND_URL=http://localhost:8080 npm start`
   (requires the backend port-forward from step 2 running concurrently)
   — watch the dashboard populate.

## Tear down

1. Stop the load generator (Ctrl-C) and any open port-forwards.
2. Delete the ArgoCD-managed namespaces first, to avoid orphaned ENIs from
   Fargate pods blocking VPC/subnet cleanup:
   `kubectl delete namespace backend monitoring argocd`
3. `cd terraform/environments/dev-eks && terraform destroy`
4. Confirm nothing was left behind:
   `aws eks list-clusters --region us-east-1` (should not list `car-fintech-eks`)
   `aws ec2 describe-network-interfaces --filters Name=description,Values="*car-fintech-eks*" --region us-east-1` (should return no results)

## Cost while running

EKS control plane (~$0.10/hr) + a handful of small Fargate pods (ArgoCD,
Prometheus, Grafana, Alertmanager, kube-state-metrics, backend, load
generator) — a few dollars for a multi-hour session. $0 once torn down.
```

- [ ] **Step 2: Commit**

```bash
git add k8s/RUNBOOK.md
git commit -m "Add stand-up/verify/teardown runbook for the EKS monitoring environment"
```

---

## Self-Review

**Spec coverage:**
- Terraform layout & separate state → Task 5 (`dev-eks` root, never touches `dev`).
- EKS cluster + Fargate profile → Task 3.
- IRSA for backend secrets access → Task 4.
- ArgoCD bootstrap + app-of-apps → Task 6.
- Backend Kustomize manifests reusing the ECS image/secrets → Task 7.
- Business + Node.js runtime metrics (`/metrics`) → Tasks 1-2.
- Monitoring stack, Fargate-compatible, ServiceMonitor, dashboard → Task 8.
- Both requested metric families (GC/event-loop lag AND container CPU throttling) → Task 8 Step 4 dashboard panels 3-5; underlying metrics from Task 1 (Node.js) and kube-state-metrics (container, ships with the chart, no extra task needed).
- Load generator for realistic traffic → Task 9.
- Verification checklist and teardown sequence → Task 10 (consolidates the per-task verification steps already run in Tasks 5-9).
- No public ALB/Ingress → confirmed absent from every k8s manifest in Tasks 6-8; access is `kubectl port-forward` throughout.

**Placeholder scan:** the only bracketed placeholders left (`<BACKEND_IRSA_ROLE_ARN>`, `<ECR_IMAGE_URI>`, the `DB_SECRET_ARN` account-ID placeholder) are values that don't exist until a prior step's live `terraform output`/`aws` command produces them — each is paired with the exact command to resolve it in the same or preceding step, not a deferred decision.

**Type/name consistency:** `creditChecksTotal`/`fraudChecksTotal`/`purchasesTotal`/`httpRequestDuration`/`register` names match between Task 1's `module.exports` and Task 2's usage. The backend `ServiceAccount`/`Service` name `backend` in Task 7 matches the `namespace_service_accounts = ["backend:backend"]` reference in Task 4 and the `ServiceMonitor` selector in Task 8. Cluster name `car-fintech-eks` is consistent across Tasks 3, 5, 6, 9, 10.
