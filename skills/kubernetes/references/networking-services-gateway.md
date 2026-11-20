# Services, Networking & Gateway API

Kubernetes imposes fundamental networking requirements that simplify microservice communication: every Pod gets its own distinct IP, all Pods can communicate with all other Pods across nodes without NAT, and agents on a node can communicate with all Pods on that node.

---

## 1. Services (`v1`)

A Kubernetes `Service` is an abstraction defining a logical set of Pods and a policy to access them, decoupled from transient Pod IP addresses.

### Service Types:
1. **`ClusterIP` (Default)**:
   - Exposes the Service on an internal cluster IP accessible only from within the cluster.
2. **`NodePort`**:
   - Exposes the Service on each Node's IP at a static port (default range: `30000-32767`).
3. **`LoadBalancer`**:
   - Exposes the Service externally using a cloud provider's Layer 4 load balancer (AWS NLB, GCP Network LB, Azure LB).
4. **`ExternalName`**:
   - Maps the Service to a DNS name via a CNAME record (no proxying).
5. **Headless (`clusterIP: None`)**:
   - Returns individual Pod IPs directly via DNS A/SRV records instead of a virtual proxy IP. Essential for StatefulSets and direct peer discovery.
   - Setting `publishNotReadyAddresses: true` allows discovery of endpoints before readiness probes pass (critical for cluster bootstrap and leader election).

---

### Traffic Routing Policies

#### 1. Internal Traffic Policy (`spec.internalTrafficPolicy`)
Controls how traffic originating from **within the cluster** to a `ClusterIP` or `NodePort` is routed:

- **`Cluster` (Default)**:
  - Traffic is routed randomly across all ready endpoints in the entire cluster.
  - Can cross node boundaries and availability zones, incurring inter-node network latency and cross-zone cloud data transfer costs.
- **`Local`**:
  - Restricts internal traffic routing strictly to ready endpoints running on the **same node** as the calling client Pod.
  - **Zero extra hops**: All packets stay on the local node network interface.
  - **Blackholing Guardrail**: If a node has no local ready pods for that service, kube-proxy **drops the packet locally** instead of routing to remote nodes.
  - **Best For**: Node-local agents (e.g., node-level logging daemons, metrics scrapers, local caching sidecars, Envoy/Istio ambient proxies).

```yaml
apiVersion: v1
kind: Service
metadata:
  name: node-local-cache
spec:
  type: ClusterIP
  internalTrafficPolicy: Local
  selector:
    app: node-cache
  ports:
    - port: 6379
      targetPort: 6379
```

#### 2. External Traffic Policy (`spec.externalTrafficPolicy`)
Controls how traffic originating from **outside the cluster** (via `NodePort` or `LoadBalancer`) is handled:

- **`Cluster` (Default)**:
  - Any node receiving external traffic proxies it to pods across the entire cluster using SNAT (Source Network Address Translation).
  - *Trade-off*: Adds an extra network hop and obscures the client's original IP address (the Pod sees the node's internal IP).
- **`Local`**:
  - Routes traffic only to local endpoints on the node that physically received the connection.
  - **Preserves Client Source IP**: No SNAT occurs; the application sees the real client IP.
  - **Health Checking**: Cloud load balancers configure health checks against nodes and only direct traffic to nodes hosting at least one ready pod.

#### 3. Session Affinity (`spec.sessionAffinity`)
Provides sticky session routing based on client IP:
```yaml
spec:
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800 # 3 hours
```

#### 4. Topology Aware Routing (`service.kubernetes.io/topology-mode`)
Automatically routes traffic to endpoints in the same availability zone to reduce cross-zone latency and cloud egress costs:
```yaml
metadata:
  annotations:
    service.kubernetes.io/topology-mode: Auto
```

---

### Service Endpoint Discovery:
- **`EndpointSlices`**: Modern, scalable replacement for monolithic `Endpoints`. Breaks large endpoint lists into chunks of up to 100 endpoints, preventing API server bottlenecks in clusters with thousands of pods.

---

## 2. Ingress (`networking.k8s.io/v1`)

Ingress exposes HTTP and HTTPS routes from outside the cluster to services within the cluster. Routing is controlled by rules defined on the Ingress resource.

- **Ingress Controller**: An Ingress resource does nothing without an active Ingress Controller running in the cluster (e.g., Ingress-NGINX, Traefik, HAProxy, Envoy).
- **Core Features**: Host-based routing, path-based routing, TLS termination, URL rewriting.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls-cert
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /v1
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8080
```

---

## 3. Gateway API (`gateway.networking.k8s.io/v1`)

The **Gateway API** is the modern evolution of Kubernetes service networking, replacing Ingress with a role-oriented, expressive, and extensible architecture.

### Decoupled Roles & Resources:
- **`GatewayClass`**: Managed by infrastructure providers (defines controller implementation).
- **`Gateway`**: Managed by cluster operators (defines entry point, ports, protocols, and TLS certificates).
- **`HTTPRoute` / `GRPCRoute` / `TCPRoute`**: Managed by application developers (attaches routing rules to Gateways).

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: store-route
spec:
  parentRefs:
    - name: production-gateway
  hostnames:
    - "store.example.com"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /products
      backendRefs:
        - name: store-v1
          port: 8080
          weight: 90
        - name: store-v2
          port: 8080
          weight: 10 # Native traffic splitting (canary)
```

---

## 4. NetworkPolicies (`networking.k8s.io/v1`)

By default, Pods are non-isolated: they accept traffic from any source. A `NetworkPolicy` introduces Layer 3/4 firewall rules.

> **Prerequisite**: Network policies require a CNI plugin that enforces them (e.g., Calico, Cilium, Weave Net). Flannel alone does not enforce NetworkPolicies.

### Zero-Trust Ingress/Egress Isolation
Production namespaces should enforce a default deny policy:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {} # Matches all pods in namespace
  policyTypes:
    - Ingress
    - Egress
```
Specific allow-rules (e.g., allowing port 53 UDP/TCP to CoreDNS, or ingress on port 8080 from the ingress controller) are then layered on top.
