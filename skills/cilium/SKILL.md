---
name: cilium
description: >
  Cilium eBPF-based cloud-native networking, observability, and security —
  high-performance routing (native Direct Routing & VXLAN/Geneve overlay), IPAM modes,
  complete Kube-Proxy replacement, L3/L4/L7 CiliumNetworkPolicy with FQDN filtering,
  BGP Control Plane, Egress Gateway, Gateway API & Service Mesh, ClusterMesh multi-cluster,
  Hubble observability, and low-level eBPF debugging with cilium-dbg.
---

# Cilium eBPF Networking, Security & Observability (v1.20)

Comprehensive reference for Cilium v1.20.5: eBPF datapath architecture, Helm/OCI configuration,
routing & IPAM modes, Kube-Proxy replacement, network security policies, BGP control plane,
Service Mesh & Gateway API, ClusterMesh multi-cluster, Hubble observability, and operational runbooks.

## When to Use This Skill

Activate when the task involves:

- Configuring **Cilium Helm values** (`values.yaml` / OCI `quay.io/cilium/charts/cilium`) or migrating/upgrading clusters to Cilium v1.20
- Deciding between **Native Direct Routing** and **Encapsulation/Overlay (VXLAN/Geneve)**, IPAM modes, WireGuard/IPsec/Ztunnel encryption, L2 Announcements, or Bandwidth Manager (EDT/BBR)
- Setting up full **Kube-Proxy replacement** with Socket-LB, Maglev, DSR (`opt`/`geneve`/`ipip`), XDP acceleration, or `CiliumLocalRedirectPolicy`
- Authoring **`CiliumNetworkPolicy`** (CNP) or **`CiliumClusterwideNetworkPolicy`** (CCNP) with L3/L4/L7 HTTP, DNS/FQDN, SNI, TLS visibility, Deny, or Host Firewall rules
- Setting up the **BGP Control Plane** (`CiliumBGPClusterConfig`, `CiliumBGPAdvertisement`, `CiliumBGPPeerConfig`) or **CiliumLoadBalancerIPPool**
- Configuring **Egress Gateway** (`CiliumEgressGatewayPolicy`) for static egress IP routing
- Implementing **Gateway API** (`GatewayClass: cilium`, `HTTPRoute`, `GRPCRoute`, GAMMA), Ingress, or `CiliumEnvoyConfig` (CEC)
- Connecting multiple clusters using **ClusterMesh**, MCS-API (`ServiceExport`/`ServiceImport`), and global services
- Setting up **Hubble** observability, Hubble Relay, Hubble UI, flow exporters, and Prometheus/OpenMetrics metrics
- Troubleshooting connectivity, PolicyMap pressure, NAT saturation, `netkit`/BIG TCP tuning, or using `cilium` / `cilium-dbg` CLIs

## Reference Docs

| Document | Covers |
|----------|--------|
| [Architecture & eBPF](references/architecture-and-ebpf.md) | eBPF kernel datapath, cilium-agent, cilium-operator, CNI plugin, Envoy proxy, identity-based security model |
| [Installation & Helm](references/installation-and-helm.md) | Helm chart values reference, Cilium CLI (`cilium install`), kernel requirements, resource sizing, eBPF map tuning |
| [Routing & IPAM](references/routing-and-ipam.md) | Native routing (`autoDirectNodeRoutes`) vs VXLAN/Geneve overlay, IPAM modes (`cluster-pool`, `kubernetes`, `crd`, `multi-pool`), MTU, WireGuard & IPsec encryption, Bandwidth Manager (EDT, BBR, Big TCP) |
| [Kube-Proxy Replacement](references/kube-proxy-replacement.md) | Socket-LB (cgroup v2), NodePort, LoadBalancer, external/internalTrafficPolicy, Maglev hashing, DSR vs SNAT, XDP acceleration, grace periods |
| [Network Policy & Security](references/network-policy-and-security.md) | Numerical identities, `CiliumNetworkPolicy`, `CiliumClusterwideNetworkPolicy`, L3/L4/L7 rules, FQDN/DNS filtering, mTLS with SPIRE, Host Policies |
| [BGP & Egress Gateway](references/bgp-and-egress-gateway.md) | BGP Control Plane (`CiliumBGPClusterConfig`, `CiliumBGPAdvertisement`, `CiliumBGPNodeConfig`), LoadBalancer IPAM pool, Egress Gateway policies |
| [Service Mesh & Gateway API](references/service-mesh-and-gateway-api.md) | Gateway API implementation (`Gateway`, `HTTPRoute`, `GRPCRoute`), Ingress controller, `CiliumEnvoyConfig` (CEC) CRDs |
| [ClusterMesh Multi-Cluster](references/clustermesh-multicluster.md) | ClusterMesh architecture, kvstore mesh, global services, service affinity (`local`/`remote`), multi-cluster network policies |
| [Hubble Observability](references/hubble-observability.md) | Hubble architecture, Hubble CLI (`hubble observe`), flow filtering, L7 visibility, Prometheus metrics exporter, OpenTelemetry export |
| [Troubleshooting & CLI](references/troubleshooting-and-cli.md) | `cilium status`, `cilium connectivity test`, `cilium monitor`, low-level `cilium-dbg` commands (bpf lb, endpoint, identity, policy), drop reasons |

## Example Configurations

| Example | Purpose |
|---------|---------|
| [helm-values-production.yaml](examples/helm-values-production.yaml) | Production Helm values: Native Routing, full Kube-Proxy replacement, Maglev, BGP, WireGuard, Hubble, and Gateway API |
| [cilium-network-policy-l7-fqdn.yaml](examples/cilium-network-policy-l7-fqdn.yaml) | `CiliumNetworkPolicy` with L7 HTTP method/path filtering, DNS FQDN egress rules, and port restrictions |
| [cilium-clusterwide-network-policy.yaml](examples/cilium-clusterwide-network-policy.yaml) | Cluster-wide default-deny baseline policy allowing internal cluster DNS, kube-apiserver, and health checks |
| [bgp-cluster-config.yaml](examples/bgp-cluster-config.yaml) | Modern BGP Control Plane configuration: `CiliumBGPClusterConfig`, `CiliumBGPAdvertisement`, and `CiliumLoadBalancerIPPool` |
| [egress-gateway-policy.yaml](examples/egress-gateway-policy.yaml) | `CiliumEgressGatewayPolicy` routing external API traffic through dedicated gateway nodes with static IPs |
| [gateway-api-httproute.yaml](examples/gateway-api-httproute.yaml) | Gateway API `GatewayClass: cilium`, `Gateway`, and canary-weighted `HTTPRoute` with header matching |
| [clustermesh-global-service.yaml](examples/clustermesh-global-service.yaml) | Multi-cluster Global Service with local service affinity and cross-cluster failover |
| [hubble-metrics-servicemonitor.yaml](examples/hubble-metrics-servicemonitor.yaml) | Prometheus Operator `ServiceMonitor` scraping Hubble flow, DNS, HTTP, and drop metrics |
