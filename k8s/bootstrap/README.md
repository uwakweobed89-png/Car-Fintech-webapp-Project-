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

> **Note:** `root-app.yaml` currently points `targetRevision` at
> `worktree-eks-monitoring` instead of `master`. This is a tracked,
> human-approved deviation while this work lives on an isolated branch
> (already pushed to origin, not yet merged). Flip it back to `master` once
> this branch is merged.

Teardown: delete the `argocd`, `backend`, and `monitoring` namespaces before
`terraform destroy` in `terraform/environments/dev-eks/` (see the root
`k8s/RUNBOOK.md` from Task 9 for the full sequence).
