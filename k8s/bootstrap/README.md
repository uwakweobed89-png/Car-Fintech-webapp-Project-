# ArgoCD bootstrap

One-time, manual steps to stand up ArgoCD itself (it can't be GitOps-managed
before it exists). After this, everything under `k8s/apps/` is managed
automatically — commit and push, ArgoCD picks it up.

1. `kubectl create namespace argocd`
2. `helm repo add argo https://argoproj.github.io/argo-helm && helm repo update`
3. Install ArgoCD **with a memory reservation on the application-controller**:
   ```bash
   helm install argocd argo/argo-cd --namespace argocd --version 7.7.3 \
     --set controller.resources.requests.memory=1536Mi \
     --set controller.resources.limits.memory=3Gi
   ```
   The `--set` flags are **required**, not optional. A bare `helm install`
   leaves the application-controller with no memory limits (BestEffort QoS);
   on Fargate it then gets OOMKilled (exit 137) in a crash loop the moment it
   tries to reconcile the `monitoring` Application's kube-prometheus-stack
   (~90 resources), and the monitoring namespace never populates. These values
   were added to the live cluster via `helm upgrade` after hitting exactly
   this — bake them into the install so a fresh bootstrap doesn't repeat it.
4. `kubectl apply -f k8s/bootstrap/root-app.yaml`
5. Get the initial admin password:
   `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d`
6. Access the UI: `kubectl port-forward svc/argocd-server -n argocd 8080:443`, browse to `https://localhost:8080`.

> **Note:** `root-app.yaml` currently points its git `targetRevision` at
> `worktree-eks-monitoring` instead of `master`. This is a tracked,
> human-approved deviation while this work lives on an isolated branch
> (already pushed to origin, not yet merged). Flip it back to `master` once
> this branch is merged — along with the other branch-pinned Application
> manifests (see the "Prerequisites" section of `k8s/RUNBOOK.md` for the full
> list: 4 lines across 3 files; leave the `65.5.1` Helm chart pin alone).

Teardown: delete the `argocd`, `backend`, and `monitoring` namespaces before
`terraform destroy` in `terraform/environments/dev-eks/` (see the root
`k8s/RUNBOOK.md` for the full sequence).
