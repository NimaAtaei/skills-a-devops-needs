# Cilium Network Policy & Security (v1.20)

## Policy Enforcement Modes & Fundamentals

Configured via `policyEnforcementMode` (Helm) / `--enable-policy` (agent):
- **`default`**: Endpoints are unrestricted until selected by at least one `ingress` or `egress` policy (per direction), which flips that direction to **default-deny**.
- **`always`**: Default-deny enforced on all endpoints even with zero policies loaded (must explicitly allow `reserved:health` if health checks are enabled).
- **`never`**: Policy enforcement disabled everywhere (used during cluster migration).

### `enableDefaultDeny` & Deny Response

- **Opt-out of default-deny**: Set `enableDefaultDeny: { egress: false, ingress: false }` on a policy (e.g., a cluster-wide DNS visibility policy) so it does not block unrelated traffic. **Warning**: `enableDefaultDeny` does **not** apply to L7 rules—any L7 rule still requires an explicit L7 allow-all (`*` or `{}`) or non-matching L7 traffic is dropped.
- **Policy Deny Response (`--policy-deny-response`)**: `none` (default silent drop) or `icmp` (experimental; returns ICMP Destination Unreachable for denied pod egress; requires allowing ICMP ingress so pods receive the error).

---

## `CiliumNetworkPolicy` & `CiliumClusterwideNetworkPolicy`

- **`CiliumNetworkPolicy` (`cilium.io/v2`, Namespaced)**: Applies to pods in its namespace.
- **`CiliumClusterwideNetworkPolicy` (`cilium.io/v2`, Cluster-scoped)**: Applies cluster-wide; supports `nodeSelector` (for Host Policies) as well as `endpointSelector`.
- Policies are **additive/whitelist** (`ingress` + `egress`), except **`ingressDeny` / `egressDeny`**, which **override all allow policies** (including K8s `NetworkPolicy`).

---

## Layer 3 Selectors

| Selector | Scope / Usage | Key Rules & Caveats |
|----------|---------------|---------------------|
| `fromEndpoints` / `toEndpoints` | Pod labels (`{}` = all in namespace) | `fromRequires`/`toRequires` were **removed in Cilium 1.19** |
| `toServices` | `k8sService` / `k8sServiceSelector` | **Do not use for `default/kubernetes`**—use `toEntities: [kube-apiserver]`. In v1.20, `toServices` + `toPorts` denies traffic if Service is missing or selectorless with 0 backends |
| `fromEntities` / `toEntities` | `host`, `remote-node`, `kube-apiserver`, `ingress`, `cluster`, `cluster-mesh`, `init`, `health`, `unmanaged`, `world`, `all` | On AKS/GKE, `fromEntities: [kube-apiserver]` ingress may lose source IP via node tunnel—use `cluster` for ingress |
| `fromNodes` / `toNodes` | Node labels | Requires `nodeSelectorLabels: true` (`--enable-node-selector-labels`) |
| `fromCIDR` / `toCIDR` / `*CIDRSet` | External IP blocks + `except` | By default does **not** match in-cluster pods/nodes unless `--policy-cidr-match-mode=pods\|nodes` (Beta) is set |
| `CiliumCIDRGroup` (`v2alpha1`) | `cidrGroupRef` / `cidrGroupSelector` | Allocates **1 identity per group**—prevents identity exhaustion on large CIDR lists |
| `toFQDNs` | `matchName`, `matchPattern` (`*`, `**.domain`) | Egress only; requires `l7Proxy=true` + DNS proxy rule; max **50 IPs/hostname** by default; cannot mix with `toEndpoints`/`toCIDR` in same rule block |

---

## Layer 4, ICMP, SNI & Layer 7 Rules

- **Layer 4 (`toPorts`)**: `port` (number or named port, applied *after* Service port mapping), optional `endPort` range (unsupported for DNS rules), `protocol`: `TCP`, `UDP`, `ANY`. *Note*: Adding any L4 rule blocks ICMP unless related to an allowed connection.
- **ICMP (`icmps`)**: `fields: [{ family: IPv4|IPv6, type: EchoRequest|8 }]`.
- **TLS SNI (`toPorts[].serverNames`)**: Egress only; requires L7 proxy (`serverNames: ["one.one.one.one"]`); resets non-matching TLS handshakes.
- **Layer 7 (`toPorts[].rules`)**:
  - **HTTP**: `path`, `method`, `host` (extended POSIX regex), `headers`, `headerMatches`. Violations return **HTTP 403**.
  - **DNS**: `matchName`, `matchPattern`. Violations return **DNS REFUSED** (use `--tofqdns-dns-reject-response-code=nameError` for `NXDomain` if Alpine/musl pods abort search-domain lookups).
  - *Caveat*: If a pure L4 rule and an L4+L7 rule match the same traffic, the L7 filter is bypassed!
  - *Caveat*: Envoy Go extensions (`proxylib`) and `kafka` L7 rules were **removed in Cilium 1.20**.
  - *IPv6 SNAT L7 fix*: Requires Linux `>= 6.14.1 / 6.12.22 / 6.6.86 / 6.1.133 / 5.15.180 / 5.10.236`.

---

## Deny Policies (`ingressDeny` / `egressDeny`)

- Enabled by default; overrides all `ingress`/`egress` allow rules and flips the endpoint/direction to default-deny.
- **Limitation**: Deny policies **do not support** L7 rules (`http`/`dns`) or `toFQDNs`.

---

## Host Policies (Host Firewall)

Uses `CiliumClusterwideNetworkPolicy` with `nodeSelector` to protect host network namespaces and `hostNetwork: true` pods:
- **Enable**: `--set hostFirewall.enabled=true` (optional `--set devices='{eth0}'`).
- **Extended IP Protocols** (no L4 ports, e.g., `VRRP`, `IGMP`, `GRE`, `IPIP`, `ESP`, `AH`): Set `--enable-extended-ip-protocols=true`.
- **Caveats**:
  - Host L7 DNS rules (Beta) route **all** host DNS (including kubelet) through `cilium-agent`; requests time out during agent restarts (pre-pull images before upgrade).
  - Incompatible with **IPsec** and host WireGuard interfaces; do not combine CRD mode + Host Policies + tunneling + KPR + WireGuard with ClusterMesh.
  - Without KPR, Host Policies match Service VIPs instead of backend pods.

---

## Standalone DNS Proxy (Alpha)

Separates the DNS proxy into a `standalone-dns-proxy` DaemonSet so cached FQDN policies survive `cilium-agent` restarts:
```yaml
l7Proxy: true
dnsProxy:
  proxyPort: 10094          # Must be explicitly non-zero
standaloneDnsProxy:
  enabled: true
  serverPort: 10095         # Must be explicitly non-zero
```
- **Caveats**: Unauthenticated localhost gRPC API (risk if untrusted `hostNetwork` pods run on nodes); cannot allocate **new** identities for unseen domains while `cilium-agent` is down.

---

## TLS Visibility / Inspection (`terminatingTLS` / `originatingTLS`)

Enables Envoy L7 HTTP inspection over HTTPS using an internal CA trusted by client pods:
- **SDS Mode (Default since v1.17)**: `tls.readSecretsOnlyFromSecretsNamespace=true`, `tls.secretsNamespace.name=cilium-secrets`, `tls.secretSync.enabled=true` (Operator syncs referenced Secrets into `cilium-secrets`).
- Verify L7 inspection via `cilium-dbg monitor -t l7`.

---

## North-South Traffic Identity Caveat

- **Tunneling mode**: External requests to a Service always carry `reserved:world`.
- **Native-routing mode**: External requests arriving directly on the backend's node carry `reserved:world`, but requests forwarded by a load-balancing node to a **remote node** arrive with **`reserved:remote-node`** (which matches `fromEntities: [cluster]`).
