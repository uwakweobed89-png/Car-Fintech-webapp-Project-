# EKS + ArgoCD + Prometheus/Grafana practice environment — design

Date: 2026-07-04
Status: Approved, ready for implementation planning

## Purpose

Car$ync was originally scoped (CloudOps-Platform session log, 2026-06-30) to
include hands-on practice with EKS, ArgoCD, and Prometheus as part of its
learning goals — distinct from the ECS/Fargate deployment the app actually
runs on today. This spec covers building that practice environment.

Primary goal is **learning**: understanding how application-level and
container-level metrics behave under real traffic, how to correlate them to
root-cause performance problems, and how GitOps (ArgoCD) manages a
Kubernetes deployment day to day. It is not a production requirement — the
ECS deployment remains the only deployment anyone/anything actually depends
on.

## Non-goals

- Replacing ECS. The ECS/Fargate deployment (`terraform/modules/app`) is
  untouched by this work and remains the live, always-on deployment.
- A publicly reachable EKS-hosted API. This cluster is reached via
  `kubectl port-forward` during a working session, not the internet.
- Production-grade HA (multi-AZ node redundancy, alerting/on-call
  integration, long-term metrics retention). This is a session-scoped
  practice environment, torn down after use.

## Architecture overview

```
Shared VPC (existing, used by ECS today)
  └── car-fintech-eks (new EKS cluster, own Terraform state)
        └── Fargate profile (namespaces: argocd, monitoring, backend)
              ├── argocd namespace
              │     └── ArgoCD (Helm-installed, bootstraps everything else)
              │           └── "app-of-apps" Application → watches k8s/apps/
              ├── backend namespace
              │     └── Deployment + Service (same ECR image as ECS)
              │           - IRSA → same Secrets Manager secrets as ECS
              │           - exposes GET /metrics (prom-client)
              └── monitoring namespace
                    └── kube-prometheus-stack (Prometheus, Grafana,
                        Alertmanager, kube-state-metrics)
                          - node-exporter DaemonSet disabled (incompatible
                            with Fargate — no visible nodes to daemon onto)
                          - scrapes backend's /metrics + kube-state-metrics'
                            container-level metrics

Load generator (k8s Job or run from a workstation) drives realistic
traffic against the backend Service so Prometheus/Grafana have real,
varying data to show instead of flat empty graphs.
```

## Components

### 1. Terraform: `terraform/environments/dev-eks/` + `terraform/modules/eks/`

A **separate Terraform root and state** from the existing `dev` environment
(which manages ECS/RDS/frontend). This is the load-bearing decision in this
design: it guarantees `terraform destroy` in `dev-eks` can never affect the
always-on ECS deployment, and vice versa.

- `modules/eks` uses `terraform-aws-modules/eks` to create:
  - EKS cluster `car-fintech-eks`, referencing the existing shared VPC's
    private subnets via data sources (no new VPC/subnets/NAT — same pattern
    `modules/app` already follows for ECS).
  - A single Fargate profile matching the `argocd`, `monitoring`, and
    `backend` namespaces. No managed EC2 node group — no node lifecycle to
    provision or tear down.
  - Cluster IAM role, Fargate pod execution role.
  - An EKS access entry mapping the deploying IAM identity to
    cluster-admin, so `aws eks update-kubeconfig` + `kubectl` work
    immediately after apply.
  - IRSA (IAM Roles for Service Accounts) role for the backend pod's
    service account, scoped to the same permissions the ECS task role has
    today (read `DB_SECRET_ARN` and `ADMIN_API_KEY` secrets).

### 2. GitOps bootstrap (not itself GitOps-managed)

ArgoCD must exist before anything can be GitOps-managed, so its initial
install is a manual, scripted step (Helm install into the `argocd`
namespace), not an ArgoCD `Application`. Immediately after, a single root
"app-of-apps" `Application` is applied, pointing at `k8s/apps/` in this
repo — from that point on, adding/changing anything under `k8s/apps/` and
pushing to `master` is enough for ArgoCD to pick it up (self-heal + auto-
sync enabled).

### 3. `k8s/apps/backend/` — the application

Kustomize base: Deployment + Service, using the **same ECR image** ECS
already deploys (same `container_image_tag` var conceptually — no new
image build, no new pipeline). Config mirrors the ECS task definition's
environment variables (`DB_SECRET_ARN`, `AWS_REGION`, `ALLOWED_ORIGINS`)
and uses IRSA instead of an ECS task role for AWS access.

**New backend code required:** `backend/src/app.js` gets a `GET /metrics`
route using the `prom-client` npm package, exposing:
- Business metrics (reusing existing `checkCredit`/`detectFraud` return
  values, no new business logic): request count/latency per route,
  purchases created, credit-check outcomes by tier, fraud-check outcomes
  (approve/review/block counts).
- Node.js runtime metrics via `prom-client`'s `collectDefaultMetrics()`:
  `nodejs_gc_duration_seconds` (GC pause time), `nodejs_eventloop_lag_seconds`
  (event loop blocking), `nodejs_heap_size_used_bytes`, `process_cpu_seconds_total`.

This `/metrics` route is additive and has no auth requirement of its own
(standard Prometheus convention) — it does not expose PII or financial
detail, only counts/timings, so this doesn't reopen the purchases
PII/IDOR issue fixed earlier.

### 4. `k8s/apps/monitoring/` — observability stack

ArgoCD `Application` pointing at the upstream `kube-prometheus-stack` Helm
chart, with a values override for Fargate compatibility:
- `nodeExporter.enabled: false` (DaemonSets don't run on Fargate — there
  are no visible nodes to daemon onto).
- Everything else (Prometheus, Grafana, Alertmanager, kube-state-metrics)
  runs as normal Deployments/StatefulSets, which Fargate supports fine.
- A `ServiceMonitor` CRD for the backend Service so Prometheus scrapes its
  `/metrics` endpoint automatically.
- One provisioned Grafana dashboard (checked in as a ConfigMap under
  `k8s/apps/monitoring/dashboards/`, auto-loaded by Grafana's sidecar)
  showing, side by side: request rate/latency, purchase/fraud outcome
  counts, `nodejs_eventloop_lag_seconds`, `nodejs_gc_duration_seconds`, and
  `rate(container_cpu_cfs_throttled_periods_total[5m])` for the backend
  pod — so event-loop lag can be visually correlated against both GC
  pauses and container-level CPU throttling in one view.

### 5. `k8s/load-generator/` — realistic traffic

A small script (Node script or `k6`, run as a one-off Kubernetes `Job` or
from a workstation against the port-forwarded Service) that continuously
exercises the API like a real user: lists/browses cars, submits purchases
with varying credit scores and down payments so the full
APPROVE/PENDING_REVIEW/BLOCK spread occurs naturally. Without this,
Grafana would show flat, empty graphs — this is what gives the dashboard
real signal to read during a session.

## Access model

No public ALB/Ingress for this cluster. ArgoCD UI, Grafana, and Prometheus
are all reached via `kubectl port-forward` during a working session — this
cluster is a learning/demo target, not customer-facing, so a second
internet-facing load balancer is unneeded cost and attack surface.

## Verification

After `terraform apply` in `dev-eks`:
1. `aws eks update-kubeconfig --name car-fintech-eks` + `kubectl get pods -A`
   — ArgoCD, backend, and monitoring pods all `Running`.
2. Backend pod passes its readiness probe against `/health`.
3. `kubectl port-forward svc/prometheus-operated 9090` → `/targets` page
   shows the backend `ServiceMonitor` target as `up`.
4. `kubectl port-forward svc/<grafana-service> 3000` → the provisioned
   dashboard renders live data once the load generator is running.
5. Stop the load generator, confirm the dashboard graphs flatten out
   (proves the data is real, not static).

## Teardown

1. Stop/delete the load generator.
2. Delete the ArgoCD-managed namespaces (`argocd`, `backend`, `monitoring`)
   before destroying infrastructure — avoids orphaned ENIs from Fargate
   pods blocking VPC/subnet cleanup.
3. `terraform destroy` in `terraform/environments/dev-eks/`.
4. Confirm via AWS Console/CLI that no EKS cluster, Fargate profile, or
   related ENIs remain.

ECS, RDS, and the frontend (separate Terraform state, `terraform/environments/dev/`)
are never touched by any of the above.

## Cost

While running: EKS control plane (~$0.10/hr) + a handful of small Fargate
pods (ArgoCD, Prometheus, Grafana, Alertmanager, kube-state-metrics,
backend, load generator) — a few dollars for a multi-hour session. $0 once
torn down. No NAT/EIP changes (reuses existing shared VPC networking).

## Testing

- No automated test suite for the Kubernetes/Terraform layer itself
  (infrastructure, not application code) — verification is the manual
  checklist above, run each session.
- The new `GET /metrics` route in `backend/src/app.js` gets a backend test
  (`backend/test/metrics.test.js`) asserting the route returns 200 and
  Prometheus-formatted text output, consistent with this repo's existing
  `node --test` + `supertest` pattern.

## Open risks / things the implementation plan should account for

- `terraform-aws-modules/eks` version pinning — pick a version compatible
  with the currently-supported EKS Kubernetes version at implementation
  time.
- IRSA setup has more moving parts (OIDC provider, trust policy) than the
  ECS task role it mirrors — the implementation plan should budget time
  for this being fiddly on the first attempt.
- `kube-prometheus-stack`'s default resource requests may be too large for
  a quick practice session's Fargate cost budget — values should set
  conservative CPU/memory requests for Prometheus/Grafana.
