# EKS + ArgoCD + Prometheus/Grafana practice environment — runbook

Session-scoped: stand up, use, tear down. The ECS/CloudFront/frontend
deployment (the actual live app) shares the **same RDS database** as this
cluster's backend pod (see "Shared database" below) but is otherwise
separate infrastructure — `terraform destroy` here never touches ECS, the
CloudFront site, or RDS itself.

Everything here was exercised end-to-end while building the environment. The
plan's original template assumed a clean happy path; the steps below fold in
the real gotchas that actually came up, each called out inline so a future
stand-up doesn't rediscover them the hard way.

---

## Prerequisites (things that must exist before stand-up, and are NOT created by `terraform apply`)

1. **A backend image that includes the `/metrics` endpoint.** The live ECS
   deployment runs `…/fintech-payment-api:latest`, which predates the
   `/metrics` route. `k8s/apps/backend/deployment.yaml` therefore points at a
   separate tag, `…/fintech-payment-api:eks-monitoring`, built from this
   repo's `backend/`. If that tag doesn't exist in ECR (or you've changed
   backend code), rebuild and push it — production's `:latest` is untouched:
   ```bash
   aws ecr get-login-password --region us-east-1 \
     | docker login --username AWS --password-stdin 326709068429.dkr.ecr.us-east-1.amazonaws.com
   docker build -t 326709068429.dkr.ecr.us-east-1.amazonaws.com/fintech-payment-api:eks-monitoring ./backend
   docker push 326709068429.dkr.ecr.us-east-1.amazonaws.com/fintech-payment-api:eks-monitoring
   ```

2. **`targetRevision` on the ArgoCD Applications.** While this work lives on
   the `worktree-eks-monitoring` branch (not yet merged), every ArgoCD
   `Application` manifest points `targetRevision` at that branch instead of
   `master`:
   - `k8s/bootstrap/root-app.yaml`
   - `k8s/apps/backend/application.yaml`
   - `k8s/apps/monitoring/application.yaml`
   **Flip all three back to `master` once this branch is merged**, or ArgoCD
   will keep tracking a branch that may no longer exist.

---

## Stand up

1. **Provision the cluster:**
   ```bash
   cd terraform/environments/dev-eks && terraform init && terraform apply
   ```
   This creates the EKS cluster, the Fargate profile, the backend IRSA role,
   **and** the `aws_security_group_rule.eks_to_rds` ingress rule that lets
   Fargate pods reach the shared RDS instance (without it the backend pod
   hangs forever in `initDB()` — see "Backend can't reach RDS" below).

2. **Point kubectl at the cluster:**
   ```bash
   aws eks update-kubeconfig --name car-fintech-eks --region us-east-1
   ```

3. **Fix CoreDNS if it's stuck `Pending`.** `kubectl get pods -n kube-system`
   — if the two `coredns-*` pods are `Pending`, they were created before the
   Fargate profile existed, so Fargate's scheduling webhook never adopted
   them (this is Fargate-only; there are no EC2 nodes for them to land on).
   Delete them so the ReplicaSet recreates them under the profile:
   ```bash
   kubectl delete pod -n kube-system -l k8s-app=kube-dns
   ```
   Both should return to `Running`/`1/1` within a minute. Cluster DNS must
   work before anything else will.

4. **Pre-install the Prometheus Operator CRDs.** `k8s/apps/monitoring/values.yaml`
   sets `crds.enabled: false` on purpose (see "ArgoCD controller OOM" below),
   so the CRDs must be applied out-of-band, once, with **server-side** apply
   (client-side apply blows the 262144-byte annotation limit on several of
   them):
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm repo update prometheus-community
   helm pull prometheus-community/kube-prometheus-stack --version 65.5.1 --untar
   kubectl apply --server-side --force-conflicts \
     -f kube-prometheus-stack/charts/crds/crds/
   ```
   `kubectl get crd | grep monitoring.coreos.com` should list 10 CRDs.

5. **Bootstrap ArgoCD** — follow `k8s/bootstrap/README.md`. Its `helm install`
   command includes the application-controller memory reservation; **use it
   as written** (a bare install OOM-loops on the monitoring stack).

6. **Wait for ArgoCD to sync the child Applications:**
   ```bash
   kubectl get applications -n argocd
   ```
   The root `car-fintech-apps` app discovers `k8s/apps/**/application.yaml`
   automatically and creates the `backend` and `monitoring` child apps; both
   should reach `Synced`/`Healthy` within a few minutes. The stack comes up in
   waves (PreSync admission-webhook Job → operator/Grafana/kube-state-metrics
   → Prometheus/Alertmanager StatefulSets), so `monitoring` sits at
   `Progressing` for a bit before `Healthy` — that's normal.

---

## Verify

1. `kubectl get pods -A` — `argocd`, `backend`, and `monitoring` namespaces
   all `Running`. There are **no** `node-exporter` pods (a DaemonSet, disabled
   in `values.yaml` because Fargate has no nodes to run it on).
2. **Backend health + metrics:**
   ```bash
   kubectl port-forward svc/backend -n backend 8080:8080
   curl http://localhost:8080/health      # {"status":"healthy","database":"connected"}
   curl http://localhost:8080/metrics     # Prometheus text, starts with "# HELP"
   ```
3. **Prometheus is scraping the backend:**
   ```bash
   kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090
   curl -s http://localhost:9090/api/v1/targets \
     | grep -o '"scrapePool":"serviceMonitor/monitoring/backend/0"[^}]*"health":"[^"]*"'
   ```
   The backend target should show `"health":"up"`.
4. **Grafana dashboard:**
   ```bash
   kubectl get secret -n monitoring monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 -d
   kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80
   ```
   Log in as `admin` at `http://localhost:3000`, open "Car$ync — Backend
   Metrics" (or `curl -s -u admin:<pw> 'http://localhost:3000/api/search?query=Car'`
   to confirm it's loaded). If only the chart's stock dashboards appear and
   not this one, the sidecar label is mismatched — `values.yaml` must set
   `grafana.sidecar.dashboards.labelValue: "true"` to match the ConfigMap's
   `grafana_dashboard: "true"` label.
5. **Generate traffic** (see `k8s/load-generator/README.md`). The plan's
   generator submits purchases, which **writes to the shared production DB** —
   for a data-safe demo use the read-only snippet in that README instead. With
   traffic flowing the dashboard's HTTP-rate / event-loop-lag / GC / CPU-throttle
   panels move within ~1 min; they flatten back toward zero ~1 min after you
   stop it, confirming the data is live.

---

## Tear down

1. Stop the load generator (Ctrl-C) and any open port-forwards.
2. **Delete the ArgoCD-managed namespaces first**, to avoid orphaned Fargate
   ENIs blocking VPC/subnet cleanup during `terraform destroy`:
   ```bash
   kubectl delete namespace backend monitoring argocd
   ```
3. `cd terraform/environments/dev-eks && terraform destroy` — this also
   removes the `eks_to_rds` security-group rule (it lives in this stack), so
   RDS goes back to allowing only ECS. RDS itself, ECS, and the frontend are
   in a **different** Terraform state and are untouched.
4. The Prometheus Operator CRDs installed in stand-up step 4 are **cluster-scoped
   and not owned by this Terraform state** — `terraform destroy` leaves them.
   They're harmless once the cluster is gone, but if you're reusing the cluster
   and want a truly clean slate (they carry no chart labels, so match by name):
   ```bash
   kubectl get crd -o name | grep '\.monitoring\.coreos\.com$' | xargs kubectl delete
   ```
5. Confirm nothing was left behind:
   ```bash
   aws eks list-clusters --region us-east-1        # no car-fintech-eks
   aws ec2 describe-network-interfaces \
     --filters Name=description,Values="*car-fintech-eks*" --region us-east-1   # empty
   ```

---

## Cost while running

EKS control plane (~$0.10/hr) + a handful of small Fargate pods (ArgoCD,
Prometheus, Grafana, Alertmanager, kube-state-metrics, operator, backend) —
a few dollars for a multi-hour session. $0 once torn down. The shared NAT
gateways (~$65-70/mo prorated, managed by the `CLOUD-OPS-project` pause
scripts) are separate and outlive this environment.

---

## Shared database — important

The EKS `backend` Deployment reuses the same `car-fintech/rds/credentials`
secret, and therefore the **same RDS database**, as the live ECS/CloudFront
deployment (both set `DB_SECRET_ARN` to the identical secret). Consequences:

- The load generator's write path (`POST /api/v1/purchases`) inserts real
  `Load Test Buyer` rows and flips real cars to `available=false` on the DB
  that feeds the live site. Use the read-only load path for demos.
- There are only ~13 seeded cars; a sustained write run depletes them, after
  which purchase attempts return `404 Car not found or already sold`
  (harmless — HTTP/runtime metrics keep flowing).

---

## Gotchas seen while building this (reference)

- **`bootstrap_self_managed_addons` shows a spurious replace-diff.** The
  upstream EKS module exposes this write-only attribute that Terraform can
  never read back, so `terraform plan` may propose replacing the cluster over
  it. It's a false positive — do **not** let it replace the cluster. (No code
  fix is possible: `lifecycle { ignore_changes }` isn't supported on module
  calls in this Terraform version.)
- **Spot-check commit-message claims against `git show`.** During this build a
  commit claimed a `.gitignore` fix that had actually been applied to the
  wrong checkout and never took effect; another applied a live SG rule that
  was never committed. Verify diffs match their messages, and that live infra
  matches git.
- **`root-app.yaml` is applied manually, not GitOps-managed.** It bootstraps
  ArgoCD's app-of-apps, so editing it in git alone does nothing to the live
  cluster — you must `kubectl apply -f k8s/bootstrap/root-app.yaml` after any
  change. It uses `directory: { recurse: true, include: "**/application.yaml" }`
  so it only ever registers child Applications; each child owns its own
  workload manifests (don't broaden this to apply raw manifests, or the root
  and child apps fight over the same resources).
- **Backend can't reach RDS.** Symptom: backend pod `Running` but never Ready,
  liveness/readiness probes get connection-refused, and the container logs
  **nothing** (it's blocked in `initDB()`'s `pool.query`). Cause: RDS's
  `myapp-rds-sg` only allowed ECS's SGs. Fix: the `eks_to_rds` rule (stand-up
  step 1) — note it must target the cluster's **primary** security group
  (`cluster_primary_security_group_id`, the one Fargate pod ENIs actually
  attach to), not the module-created `aws_security_group.cluster[0]`.
- **ArgoCD controller OOM on the monitoring stack.** Symptom: `monitoring`
  app stuck `OutOfSync`/`Missing`, namespace empty, `argocd-application-controller-0`
  crash-looping with `OOMKilled` (exit 137). Two-part fix, both already baked
  into this repo: (a) `crds.enabled: false` in `values.yaml` + pre-installing
  CRDs (stand-up step 4); (b) the controller memory reservation in the
  bootstrap `helm install` (step 5). If the controller crashes mid-sync it can
  leave a stale `status.operationState` ("waiting for completion of hook …"
  for a Job that already finished); clear it with
  `kubectl patch application monitoring -n argocd --type merge -p '{"status":{"operationState":null}}'`.
