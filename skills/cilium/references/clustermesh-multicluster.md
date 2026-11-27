# Cilium ClusterMesh Multi-Cluster Networking (v1.20)

## Architecture

ClusterMesh connects multiple Kubernetes clusters into a unified datapath and identity domain with direct node-to-node forwarding (no intermediate gateway proxy):
- **`clustermesh-apiserver` pod**: Runs an embedded single-instance `etcd` (exposed via mTLS LB/NodePort/ClusterIP on port `2379`), `apiserver` (exports local Services/Identities/Nodes), and **`kvstoremesh`** (caches remote clusters' state locally).
- **Trust Domain**: All connected clusters share one trust domain—only connect mutually trusted clusters.

---

## Prerequisites & Scaling Limits

- **Datapath Parity**: All clusters must use the same routing mode (all Encapsulation or all Native-Routing).
- **Version Skew**: Cilium versions across connected clusters must differ by **at most 1 minor release**.
- **CIDRs & Connectivity**: Non-overlapping PodCIDRs across all clusters; node `InternalIP` reachability + firewall rules (VXLAN `8472/udp` or Geneve `6081/udp`, ClusterMesh `2379/tcp`). In **Native-Routing**, `ipv4NativeRoutingCIDR` must cover *all* clusters' PodCIDRs and nodes must route pod-to-pod IPs directly.
- **Cluster Identity**: Unique `cluster.name` (`<= 32` chars, lowercase alphanumeric + internal `-`) and unique `cluster.id` (`1–255` default, or `1–511`). Changing `cluster.name`/`id` requires restarting all workloads.
- **Scaling (`clustermesh.maxConnectedClusters`)** *(must match across all clusters and be set at install time)*:
  - `255` (default): up to `65,535` cluster-local identities.
  - `511`: up to `32,767` cluster-local identities.

---

## Setup & mTLS Certificates

All clusters must share a common CA (`cilium-ca` Secret or `tls.caBundle`):
- **`cronJob` (`certgen`)**: `clustermesh.apiserver.tls.auto.{enabled: true, method: cronJob, certValidityDuration: 365, schedule: "0 0 1 */4 *"}`.
- **`certmanager`**: `method: certmanager`, `certManagerIssuerRef: { group: cert-manager.io, kind: ClusterIssuer, name: ca-issuer }`.
- **`helm`**: Regenerated only on `helm upgrade` (no automatic renewal).
- **User-provided (`auto.enabled: false`)**: Pre-create Secrets `clustermesh-apiserver-{server,admin,remote,local}-cert` (`tls.crt`, `tls.key`, `ca.crt`).

### Cilium CLI Quick Setup & Validation

```bash
cilium clustermesh enable --context $CLUSTER1
cilium clustermesh enable --context $CLUSTER2
cilium clustermesh connect --context $CLUSTER1 --destination-context $CLUSTER2
cilium clustermesh status --context $CLUSTER1 --wait
cilium connectivity test --context $CLUSTER1 --multi-cluster $CLUSTER2
```

### Helm Configuration

Set `clustermesh.useAPIServer: true`, `clustermesh.config.enabled: true`, `clustermesh.apiserver.service.type: LoadBalancer` (or `NodePort`/`ClusterIP`), and list remote endpoints under `clustermesh.config.clusters.<name>.{address, port: 2379}`.

---

## Global Services, MCS-API & Service Affinity

### 1. Global Services (Annotations)
Create identically named Services in each cluster with:
- `service.cilium.io/global: "true"` — merges endpoints across all clusters.
- `service.cilium.io/shared: "true"` (default) or `"false"` (consume remote endpoints without advertising local ones).
- `service.cilium.io/global-sync-endpoint-slices: "true"` (Beta; requires `clustermesh.enableEndpointSliceSynchronization=true`; default `true` for Headless Services).
- **Service Affinity**: `service.cilium.io/affinity: "none" | "local" | "remote"` (`local` prefers healthy local endpoints and fails over to remote only when all local backends are unavailable). Verify via `cilium-dbg service list --clustermesh-affinity`.
- **Stale Cache TTL**: Default `clustermesh.cacheTTL="0s"` retains remote backends forever if a cluster becomes unreachable; set e.g. `"15m"` to expire stale remote endpoints.
- **Limitation**: Global NodePort and host-network access require `kubeProxyReplacement=true` (or `socketLB.enabled=true`).

### 2. Kubernetes MCS-API (`multicluster.x-k8s.io/v1beta1`)
- Enable with `--set clustermesh.mcsapi.enabled=true` (+ `--set clustermesh.mcsapi.corednsAutoConfigure.enabled=true` on CoreDNS `>= 1.12.2` for `clusterset.local`).
- Create a `ServiceExport`; Cilium creates `ServiceImport` and a derived Global Service accessible at `<svc>.<ns>.svc.clusterset.local`.
- **Gateway API (GEP1748)**: `HTTPRoute` can reference `kind: ServiceImport, group: multicluster.x-k8s.io`.

---

## Multi-Cluster Network Policy (v1.19+ Default)

NetworkPolicies are **not** synced across clusters—apply them in every cluster:
- **Since Cilium v1.19+**, policies select **local cluster endpoints only by default** (`--policy-default-local-cluster=true`).
- Target a specific remote cluster: `io.cilium.k8s.policy.cluster: <cluster-name>`.
- Target all connected clusters: `matchExpressions: [{ key: io.cilium.k8s.policy.cluster, operator: Exists }]`.

---

## Troubleshooting ClusterMesh

```bash
cilium clustermesh status
kubectl exec -it -n kube-system ds/cilium -c cilium-agent -- cilium-dbg troubleshoot clustermesh
kubectl exec -it -n kube-system deploy/clustermesh-apiserver -c kvstoremesh -- clustermesh-apiserver kvstoremesh-dbg troubleshoot
kubectl exec -it -n kube-system ds/cilium -- cilium-dbg status --all-clusters
```
