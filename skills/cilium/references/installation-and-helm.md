# Cilium Installation, Helm, Migration & Upgrades (v1.20)

## Installation Methods

Cilium can be installed using the **Cilium CLI** (`cilium install`) for fast scaffolding or **Helm** (`oci://quay.io/cilium/charts/cilium` or `https://helm.cilium.io/`) for production GitOps.

> **Version Convention**: Helm chart versions use SemVer 2.0 **without** the `v` prefix (`1.20.5`), whereas container image tags include `v` (`v1.20.5`).

### 1. Cilium CLI (Quickstart & Validation)

```bash
# Install Cilium CLI (Linux amd64/arm64)
CILIUM_CLI_VERSION=$(curl -s https://raw.githubusercontent.com/cilium/cilium-cli/main/stable.txt)
CLI_ARCH=amd64
if [ "$(uname -m)" = "aarch64" ]; then CLI_ARCH=arm64; fi
curl -L --fail --remote-name-all https://github.com/cilium/cilium-cli/releases/download/${CILIUM_CLI_VERSION}/cilium-linux-${CLI_ARCH}.tar.gz{,.sha256sum}
sha256sum --check cilium-linux-${CLI_ARCH}.tar.gz.sha256sum
sudo tar xzvfC cilium-linux-${CLI_ARCH}.tar.gz /usr/local/bin
rm cilium-linux-${CLI_ARCH}.tar.gz{,.sha256sum}

# Install Cilium (automatically restarts pre-existing unmanaged pods)
cilium install --version 1.20.5

# Validate rollout and run full connectivity matrix
cilium status --wait
cilium connectivity test
```

### 2. Helm Chart (OCI Registry Recommended)

The OCI registry (`oci://quay.io/cilium/charts/cilium`) is cosign-signed and supports SHA256 digest pinning without `helm repo add`:

```bash
# Verify chart signature with cosign
cosign verify \
  --certificate-identity-regexp='https://github.com/cilium/cilium/.*' \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  quay.io/cilium/charts/cilium:1.20.5

# Install directly from OCI
helm install cilium oci://quay.io/cilium/charts/cilium \
  --version 1.20.5 \
  --namespace kube-system \
  -f values.yaml

# Migrate an existing Helm-repo install to OCI
helm upgrade cilium oci://quay.io/cilium/charts/cilium \
  --version 1.20.5 --namespace kube-system --reuse-values
```

Traditional Helm repository:

```bash
helm repo add cilium https://helm.cilium.io/
helm repo update
helm install cilium cilium/cilium --version 1.20.5 --namespace kube-system -f values.yaml
```

---

## Node Pool Taints & Unmanaged Pods

Pods scheduled before `cilium-agent` initializes—or after a cloud node reboot resets CNI config—can receive IPs from a fallback CNI and become **unmanaged**:

- Pre-taint nodes with `node.cilium.io/agent-not-ready=true:NoExecute` (recommended over `NoSchedule` because `NoExecute` evicts pods if the taint is re-applied during node replacement).
- `cilium-agent` removes this taint once ready; `cilium-operator` re-applies `NoSchedule` if Cilium is temporarily removed.
- **Cluster Autoscaler**: If autoscaler flags cannot be customized, override `agent-not-ready-taint-key` to a key prefixed with `ignore-taint.cluster-autoscaler.kubernetes.io/`.
- **Manual restart of unmanaged pods**:
  ```bash
  kubectl get pods --all-namespaces -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,HOSTNETWORK:.spec.hostNetwork --no-headers=true | grep '<none>' | awk '{print "-n "$1" "$2}' | xargs -L 1 -r kubectl delete pod
  ```

---

## Platform-Specific Helm Flags

| Platform | Key Flags & Prerequisites |
|----------|---------------------------|
| **GKE** | `--set nodeinit.enabled=true --set nodeinit.reconfigureKubelet=true --set nodeinit.removeCbrBridge=true --set cni.binPath=/home/kubernetes/bin --set gke.enabled=true --set ipam.mode=kubernetes --set ipv4NativeRoutingCIDR=$NATIVE_CIDR` |
| **AKS (BYOCNI)** | Create cluster with `--network-plugin none`; use `--set aksbyocni.enabled=true --set ipam.operator.clusterPoolIPv4PodCIDRList=192.168.0.0/16` |
| **EKS (ENI Mode)** | Patch `aws-node` DaemonSet with `nodeSelector: io.cilium/aws-node-enabled=true`; install with `--set eni.enabled=true` (IPv4-only; requires EC2 IAM permissions) |
| **Talos Linux (`>= 1.5`)** | Disable default CNI & kube-proxy; drop `SYS_MODULE`; use KubePrism: `--set ipam.mode=kubernetes --set kubeProxyReplacement=true --set cgroup.autoMount.enabled=false --set cgroup.hostRoot=/sys/fs/cgroup --set k8sServiceHost=localhost --set k8sServicePort=7445` |
| **k3s** | Install k3s with `--flannel-backend=none --disable-network-policy`; `--set operator.replicas=1` |
| **Alibaba ACK** | Delete Flannel/Terway DaemonSets; create `cilium-alibabacloud` Secret; `--set alibabacloud.enabled=true --set ipam.mode=alibabacloud --set enableIPv4Masquerade=false --set routingMode=native` |

### CNI Chaining

When Cilium chains on top of another CNI (AWS VPC CNI, Azure CNI legacy, Calico, OKE VCN-native, generic veth, portmap, Weave) for IPAM/base connectivity:
- **Always set `cni.enableRouteMTUForCNIChaining=true`** if using WireGuard encryption, Egress Gateway, or Tunneling (`routingMode=tunnel`) to prevent MTU fragmentation.

---

## Live Cluster Migration (Dual-Overlay Procedure)

You can migrate node-by-node from another Linux-routing CNI (Flannel, Calico, AWS-CNI) without cluster rebuild:

1. **Install Cilium in non-conflicting secondary overlay**:
   - `operator.unmanagedPodWatcher.restart: false`, `cni.customConf: true`, `cni.uninstall: false`
   - Distinct PodCIDR (`ipam.mode: cluster-pool`, e.g., `10.245.0.0/16`) and distinct tunnel port/protocol (`routingMode: tunnel`, `tunnelProtocol: vxlan`, `tunnelPort: 8473`)
   - `policyEnforcementMode: "never"` and `bpf.hostLegacyRouting: true`
2. **Create `CiliumNodeConfig` (`cilium.io/v2`)** matching `io.cilium.migration/cilium-default: "true"` to write `/host/etc/cni/net.d/05-cilium.conflist` with `cni-exclusive: "true"`.
3. **Migrate node-by-node** (never start with a control-plane node): cordon & drain -> label node `io.cilium.migration/cilium-default=true` -> restart Cilium pod on node -> reboot node -> validate pod CIDR & apiserver connectivity -> uncordon.
4. **Finalize**: Upgrade Helm with `operator.unmanagedPodWatcher.restart=true`, `cni.customConf=false`, `policyEnforcementMode=default`, remove `CiliumNodeConfig`, and delete the legacy CNI.

---

## Configuration Management (`cilium-config`)

Helm values translate into keys in `kube-system/cilium-config` ConfigMap (flags without leading `--`). Three ways to update:
1. `helm upgrade ... --set rollOutCiliumPods=true` (recommended).
2. `cilium config set <key> <value>` (restarts agent pods by default; pass `--restart=false` for manual rollout).
3. `CiliumNodeConfig` (`cilium.io/v2`) for per-node overrides (requires manual pod restart on matching nodes).

- **Config Drift Detection**: Enabled by default in v1.20 (`configDriftDetection: true`), exposing Prometheus alerts when ConfigMap edits have not yet been applied via pod restart.

---

## Firewall Ports & System Requirements

| Port / Protocol | Purpose |
|-----------------|---------|
| `4240/tcp` & `ICMP 0/8` | `cilium-health` inter-node cluster health checks |
| `8472/udp` / `6081/udp` | VXLAN / Geneve overlay tunnels |
| `51871/udp` / `ESP` | WireGuard / IPsec transparent encryption |
| `4244/tcp` / `4245/tcp` | Hubble server (agent) / Hubble Relay |
| `2379-2380/tcp` | ClusterMesh `clustermesh-apiserver` / etcd |
| `9962`, `9963`, `9964/tcp` | Prometheus metrics (`cilium-agent`, `cilium-operator`, `cilium-envoy`) |
| `9878`, `9879/tcp` | Localhost health APIs (`cilium-envoy`, `cilium-agent`) |

- **Reserved Linux Routing Tables**: `200` (IPsec), `202` (VTEP), `2004` (to-proxy), `2005` (from-proxy), plus `10 + <eni-index>` in AWS ENI mode.

---

## Upgrade Guide & Cilium 1.20 Notes

### Safe Upgrade Rules
- Upgrade **one minor version at a time** (always patch to the latest patch of your current minor series first).
- **Never use `--reuse-values` across minor versions** (it drops new chart defaults). Export current values with `helm get values cilium -n kube-system -o yaml > values.yaml`, merge changes, and run `helm upgrade`.
- Set `upgradeCompatibility=1.X` to the **initial** Cilium version installed in the cluster to minimize datapath disruption.
- **Run Pre-flight Check (Required)**:
  ```bash
  helm install cilium-preflight oci://quay.io/cilium/charts/cilium --version 1.20.5 \
    --namespace kube-system --set preflight.enabled=true --set agent=false --set operator.enabled=false
  # Verify Ready counts match, inspect cnp-validator logs if 0/1, then delete before upgrading:
  helm delete cilium-preflight --namespace kube-system
  ```

### Key Cilium 1.20 Breaking Changes & Removals
- **Envoy Go Extensions (`proxylib`) & Kafka policies removed**: Remove `kafka`, `l7`, `l7proto` from CNPs before upgrading.
- **`CiliumNodeConfig` `v2alpha1` removed**: Update manifests to `cilium.io/v2`.
- **CNI spec v1.0.0** is now default; **Gateway API `>= v1.6.1`** required (if using `TLSRoute`, install Experimental v1.6.1 CRDs to preserve `v1alpha2` objects during upgrade to `v1`).
- **`toServices` + `toPorts` egress**: Missing or selectorless Services with no backends now deny traffic instead of allowing all destinations on those ports.
- **Mutual Authentication (Beta) deprecated**: Prefer **Ztunnel Transparent Encryption (Beta)**.
- **Empty `CNP`/`CCNP`** (missing both `spec` and `specs`) are rejected at admission by CEL validation.
- **Removed/Renamed Flags**: `--node-port-algorithm` -> `--bpf-lb-algorithm`, `--node-port-mode` -> `--bpf-lb-mode`, `clustermesh.enableMCSAPISupport` -> `clustermesh.mcsapi.enabled`, `hubble.preferIpv6` -> `preferIpv6`, `cilium-dbg bgp` peers/routes -> `cilium shell -- bgp/*`.
