---
name: kubernetes
description: >-
  Comprehensive guide and operational runbook for Kubernetes architecture, workloads,
  networking, storage, security, and cluster operations. Activate this skill when
  designing, authoring, deploying, securing, debugging, or optimizing Kubernetes
  manifests (Deployments, StatefulSets, Services, Gateway API, NetworkPolicies,
  RBAC, PVCs), running rollout lifecycles, or troubleshooting failing pods and networking.
---

# Kubernetes Skill

This skill provides an authoritative, production-grade guide to Kubernetes concepts, resource authoring, networking, security policies, and operational runbooks based on official Kubernetes documentation and industry best practices.

## Core Pillars & Competencies

- **Cluster Architecture**: Control Plane (`kube-apiserver`, `etcd`, `kube-scheduler`, `kube-controller-manager`) and Node architecture (`kubelet`, `kube-proxy`, Container Runtime Interface).
- **Workload Management**: Declarative management of `Deployments`, `StatefulSets`, `DaemonSets`, `Jobs`, `CronJobs`, and Pod lifecycle with startup/liveness/readiness probes.
- **Services & Networking**: Service routing (`ClusterIP`, `NodePort`, `LoadBalancer`, `Headless`), `internalTrafficPolicy` & `externalTrafficPolicy` controls, Layer 7 Ingress, the next-gen **Gateway API** (`GatewayClass`, `Gateway`, `HTTPRoute`), and zero-trust `NetworkPolicies`.
- **Storage Ecosystem**: Storage abstraction with `PersistentVolumes`, `PersistentVolumeClaims`, dynamic provisioning via `StorageClasses`, and `VolumeSnapshots`.
- **Configuration & QoS**: Managing configuration via `ConfigMaps` and `Secrets`, Downward API, resource requests/limits, and QoS classes (`Guaranteed`, `Burstable`, `BestEffort`).
- **Cluster Security & RBAC**: The 4C security model, Pod Security Standards (PSS) profiles (`Privileged`, `Baseline`, `Restricted`), and Least-Privilege Role-Based Access Control (`Role`, `ClusterRole`, `RoleBinding`, `ClusterRoleBinding`).
- **Advanced Scheduling**: Fine-grained placement via `Taints & Tolerations`, `Node Affinity`, `Pod Affinity/Anti-Affinity`, and `Topology Spread Constraints`.
- **Operations & Troubleshooting**: Zero-downtime rolling updates, canary releases, `kubectl debug` with ephemeral containers, crash diagnostics, and DNS/service connectivity troubleshooting.

---

## Documentation & Progressive Disclosure Guides

Dive deep into specific areas through the technical guides:

1. [Cluster Architecture & Control Plane](./references/architecture-and-control-plane.md)
   - Control plane loops, etcd quorum & backup, kubelet reconciliation, kube-proxy modes, and node lifecycles.
2. [Workloads & Pod Lifecycle](./references/workloads-and-lifecycle.md)
   - Deployments, StatefulSets, DaemonSets, Jobs, CronJobs, init/sidecar containers, and probe configuration.
3. [Networking, Services & Gateway API](./references/networking-services-gateway.md)
   - Pod networking model, Service topologies, `internalTrafficPolicy` & `externalTrafficPolicy`, session affinity, Ingress controllers, Gateway API, and NetworkPolicy recipes.
4. [Storage, PVCs & Snapshots](./references/storage-and-pvcs.md)
   - Storage classes, volume binding modes (`WaitForFirstConsumer`), PVC expansion, access modes, and CSI snapshots.
5. [Configuration, Secrets & Resource Management](./references/configuration-and-resources.md)
   - ConfigMaps, Secrets (encryption at rest), Downward API, CPU/Memory QoS, ResourceQuotas, and LimitRanges.
6. [Security, RBAC & Pod Security Standards](./references/security-rbac-and-pss.md)
   - PSS namespace enforcement labels, RBAC rules design, ServiceAccount token projection, and container hardening.
7. [Advanced Scheduling & Placement](./references/scheduling-and-placement.md)
   - Taints and tolerations, node affinity, pod anti-affinity across failure zones, and topology spread constraints.
8. [Operations, Rollouts & Lifecycles](./references/operations-and-rollouts.md)
   - Rollout strategies (`maxSurge`/`maxUnavailable`), rollback runbooks (`kubectl rollout`), and graceful node draining.
9. [Debugging & Troubleshooting Runbooks](./references/debugging-and-troubleshooting.md)
   - Systematic triage for `CrashLoopBackOff`, `OOMKilled`, `ImagePullBackOff`, ephemeral debugging, and network diagnostics.
10. [kubectl Conventions & API Standards](./references/kubectl-and-api-conventions.md)
    - Client/server dry-run, jsonpath parsing, diffing, custom output formatting, and API version lifecycle (GVK/GVR).

---

## Production Manifest Examples

Canonical, production-tested Kubernetes manifests located in [examples/](./examples/):

- [Production Deployment](./examples/production-deployment.yaml): Hardened deployment with probes, resources, security context, and topology spread.
- [StatefulSet with VolumeClaimTemplates](./examples/statefulset-with-storage.yaml): Clustered stateful workload with dedicated persistent storage.
- [Service & Ingress](./examples/service-and-ingress.yaml): ClusterIP service paired with a TLS-enabled Ingress.
- [Gateway API HTTPRoute](./examples/gateway-api-httproute.yaml): Modern Gateway API routing configuration.
- [Default Deny NetworkPolicy](./examples/network-policy-default-deny.yaml): Zero-trust network policy isolating a namespace.
- [RBAC Role & Binding](./examples/rbac-role-and-binding.yaml): Scoped read/write role and ServiceAccount binding.
- [Topology Spread Constraints](./examples/topology-spread-constraints.yaml): High availability pod distribution across multi-zone nodes.
- [CronJob Batch Workload](./examples/cronjob.yaml): Robust scheduled job with concurrency controls and retry limits.
- [Horizontal Pod Autoscaler](./examples/horizontal-pod-autoscaler.yaml): Autoscaling with CPU/Memory targets and custom scale-up/scale-down stabilization policies.

---

## Quick Operational Cheatsheet

```bash
# Declarative application and diffing
kubectl diff -f manifest.yaml
kubectl apply -f manifest.yaml

# Rollout status and lifecycle management
kubectl rollout status deployment/<name>
kubectl rollout history deployment/<name>
kubectl rollout undo deployment/<name> --to-revision=2
kubectl rollout restart deployment/<name>

# Ephemeral container debugging (without restarting or rebuilding image)
kubectl debug -it <pod-name> --image=busybox:latest --target=<container-name>

# Node maintenance
kubectl cordon <node-name>
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
kubectl uncordon <node-name>

# Rapid manifest generation (dry run)
kubectl create deployment my-app --image=nginx:alpine --dry-run=client -o yaml > deployment.yaml
kubectl expose deployment my-app --port=80 --target-port=8080 --type=ClusterIP --dry-run=client -o yaml > service.yaml
```
