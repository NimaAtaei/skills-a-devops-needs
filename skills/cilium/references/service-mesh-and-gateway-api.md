# Cilium Service Mesh, Gateway API & Ingress (v1.20)

## Architecture & Shared Prerequisites

Cilium implements sidecarless Service Mesh, Ingress, and Gateway API using eBPF + per-node Envoy (`cilium-envoy`):
- **Prerequisites**: `kubeProxyReplacement=true` and `l7Proxy=true` (default).
- **TPROXY**: Ingress/Gateway traffic redirects to Envoy via kernel TPROXY (`bpf.tproxy=false` requires iptables/netfilter modules; `bpf.tproxy=true` Beta uses eBPF TPROXY without iptables—incompatible with `netkit` mode).
- **Policy Enforcement**: Evaluated at two points: `world` -> `reserved:ingress` identity, and `reserved:ingress` -> backend pod identity.
- **Source IP Preservation**: Envoy sets `X-Forwarded-For` (`useRemoteAddress: true` by default; set `false` to trust upstream proxy XFF) and `X-Envoy-External-Address`. *Exception*: TLS Passthrough opens a new TCP stream from Envoy, so backends see Envoy/Node IP.
- **Privileged Ports (`<= 1023`) in Host Network Mode**: Set `envoy.securityContext.capabilities.keepCapNetBindService=true` and add `NET_BIND_SERVICE` to `envoy.securityContext.capabilities.envoy` (or `ciliumAgent` in embedded mode).

---

## Kubernetes Ingress Controller

- **Enable**: `--set ingressController.enabled=true --set ingressController.loadbalancerMode=dedicated` (or `shared`; `--set ingressController.default=true`).
- **Host Network Mode**: `ingressController.hostNetwork.enabled=true` (mutually exclusive with LB/NodePort Service mode; binds `0.0.0.0`/`::`, default `sharedListenerPort: 8080`).
- **Path Precedence**: `Exact` > `ImplementationSpecific` (treated as **Regex**—avoid trailing `*` outsorting shorter paths) > `Prefix` (`/` always last), ordered by decreasing length.
- **Key Ingress Annotations**:
  - `ingress.cilium.io/loadbalancer-mode`: `dedicated` | `shared`
  - `ingress.cilium.io/service-type`: `LoadBalancer` | `NodePort`
  - `ingress.cilium.io/service-external-traffic-policy`: `Cluster` | `Local`
  - `ingress.cilium.io/host-listener-port`: Required for dedicated `hostNetwork` mode
  - `ingress.cilium.io/tls-passthrough`: `enabled` | `disabled` (requires `host`; ignores non-`/` paths)
  - `ingress.cilium.io/force-https`: `enabled` | `disabled`
  - `ingress.cilium.io/request-timeout`: Seconds (`0` = unlimited)
  - LB annotation prefixes forwarded to the LB Service: `lbipam.cilium.io`, `nodeipam.cilium.io`, `service.beta.kubernetes.io`, `service.kubernetes.io`, `cloud.google.com`.

---

## Gateway API (v1.6.3 Core Conformance)

- **Supported Resources**: `GatewayClass`, `Gateway`, `HTTPRoute`, `GRPCRoute`, `TLSRoute`, `BackendTLSPolicy`, `ReferenceGrant`, plus optional `ListenerSet`, `TCPRoute`, `UDPRoute`.
- **Setup**: Install Gateway API `>= v1.6.1` (v1.6.3 recommended) CRDs with `--server-side` first, then enable `--set kubeProxyReplacement=true --set gatewayAPI.enabled=true` and restart `deploy/cilium-operator` and `ds/cilium`.
  - *Upgrade Caveat*: Gateway API v1.6 promoted `TLSRoute` from `v1alpha2` to `v1`—if upgrading with existing `TLSRoute` objects, install the **Experimental** v1.6.1+ CRDs first so `v1alpha2` objects remain readable.
- **Host Network Mode**: `gatewayAPI.hostNetwork.enabled=true` (+ `nodes.matchLabels`). **Incompatible with `TCPRoute` and `UDPRoute`**. `GatewayStatusAddress` caps at 16 sorted node addresses.
- **IP Addressing**: Use `Gateway.spec.addresses[]` (`type: IPAddress`, works with LB IPAM).
- **Parameterized GatewayClass (`CiliumGatewayClassConfig`, `cilium.io/v2alpha1`, Namespaced, short: `cgcc`)**:
  - Referenced via `GatewayClass.spec.parametersRef` (`controllerName: io.cilium/gateway-controller`).
  - Controls `spec.service.type` (`NodePort`/`LoadBalancer`), `spec.httpOptions.grpcWebTranslation.enabled`, `spec.envoy.serverHeaderTransformation` (`OVERWRITE` | `APPEND_IF_ABSENT` | `PASS_THROUGH`).

### GAMMA (East-West Service Mesh)
- Supports Service-parented `HTTPRoute`, `GRPCRoute`, and `ReferenceGrant`.
- **Producer-only**: Route must reside in the **same namespace** as the parent Service (`MeshConsumerRoute` is unsupported).

---

## `CiliumEnvoyConfig` (CEC) & L7 Proxy Load Balancing

- **Enable**: `--set envoyConfig.enabled=true` (CRDs: `CiliumEnvoyConfig` namespaced, `CiliumClusterwideEnvoyConfig` cluster-wide). Uses **Envoy API v3** only.
- **Validation Caveat**: Kubernetes `kubectl apply` does **not** validate Envoy resource payloads—always check `cilium-agent` logs for Envoy rejection errors.
- **East-West CEC Caveat**: For standalone east-west CECs (without Ingress/Gateway `parentRefs`), set annotation `cec.cilium.io/use-original-source-address: "false"` to prevent 5-tuple collisions on pipelined HTTP/1.1 or HTTP/2.
- **L7 Service Load Balancing (Beta)**: Enable via `--set loadBalancer.l7.backend=envoy` + Service annotations:
  - `service.cilium.io/lb-l7: "enabled"`
  - `service.cilium.io/lb-l7-algorithm: "round_robin" | "least_request" | "random"`

---

## Troubleshooting Service Mesh

```bash
# Verify KPR, Envoy config, and Ingress/Gateway resources
kubectl -n kube-system exec ds/cilium -- cilium-dbg status | grep -E "KubeProxy|Envoy"
kubectl get gateway,httproute,ingress,cec -A
kubectl -n kube-system logs deploy/cilium-operator | grep gateway

# Inspect flows between world (2), ingress (8), and backend pod
hubble observe --identity 2 --identity 8
```
