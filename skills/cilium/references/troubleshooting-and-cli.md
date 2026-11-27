# Cilium Troubleshooting, CLI Reference & Performance Tuning (v1.20)

## `cilium` CLI vs. `cilium-dbg` Cheatsheet

### Cluster-Level (`cilium` CLI)
```bash
cilium status --verbose                        # Overall health, KPR, Host Routing, XDP, Encryption
cilium connectivity test --request-timeout 30s # Full pod/service/DNS/policy matrix
cilium config view                             # Inspect active cilium-config
cilium bgp peers                               # BGP session state
cilium clustermesh status --wait               # ClusterMesh connectivity & sync status
cilium sysdump                                 # Collect full diagnostics (use --node-list on >20 nodes)
```

### Node/Agent-Level (`kubectl -n kube-system exec ds/cilium -- cilium-dbg ...`)
```bash
cilium-dbg status --all-controllers --all-health --all-redirects
cilium-dbg endpoint list                       # Local pods, IDs, identities, enforcement state
cilium-dbg endpoint get <id>                   # Policy realized state & derived-from-rules
cilium-dbg endpoint config <id> Debug=true     # Enable per-endpoint debug logging
cilium-dbg identity list                       # Numerical identities & security-relevant labels
cilium-dbg policy get                          # Loaded policy rules on node
cilium-dbg policy selectors                    # Inspect selector identity counts (debug PolicyMap pressure)
cilium-dbg service list                        # BPF service VIPs & backends
cilium-dbg monitor --type drop                 # Live packet drops with reason codes
cilium-dbg monitor -v -v --related-to=<id>     # Verbose trace for specific endpoint
cilium-dbg monitor -t l7                       # L7 Envoy proxy events
cilium-dbg bpf lb list                         # Kernel LB service map
cilium-dbg bpf ct list global                  # Kernel connection tracking table
cilium-dbg bpf ct flush                        # Flush CT table (use with caution)
cilium-dbg bpf ipcache list                    # IP-to-Identity mappings
cilium-dbg bpf egress list                     # Active Egress Gateway rules
cilium-dbg bpf bandwidth list                  # EDT bandwidth limits per endpoint
cilium-dbg shell -- db/show nat-stats          # Top 30 NAT tuples by port saturation
cilium-dbg shell -- db/show l2-announce        # L2 Announcement state
cilium-bugtool                                 # Node-level bug archive in /tmp
```

---

## Symptom Library & Common Failures

| Symptom | Root Cause / Investigation | Resolution |
|---------|---------------------------|------------|
| **Node-to-node traffic dropped** | Check `cilium-health status --verbose` & `cilium-dbg monitor --type drop`. In Tunnel mode, check `tcpdump -n -i cilium_vxlan` & `cilium-dbg bpf ipcache list`. | Open `8472/udp` (VXLAN) or `6081/udp` (Geneve) / `4240/tcp` in firewall; in Native mode verify kernel/router PodCIDR routes. |
| **`CT: Map insertion failed`** | Conntrack table full. Monitor `cilium_datapath_conntrack_gc_entries`. | Raise `bpf.ctTcpMax` / `bpf.ctAnyMax` (or `bpf.mapDynamicSizeRatio`) and check `--conntrack-gc-interval`. |
| **PolicyMap overflow / pressure** | `cilium_bpf_map_pressure{map_name="cilium_policy_v3_*"}` near `1.0`. Run `cilium-dbg policy selectors`. | Replace `/32` CIDRs with wider CIDRs or `CiliumCIDRGroup`; trim high-cardinality labels; raise `bpf.policyMapMax` only as last resort. |
| **Unmanaged pods** | Pods started before Cilium or after cloud CNI reset (`cilium status` shows `X/Y managed`). | Pre-taint nodes with `node.cilium.io/agent-not-ready=true:NoExecute` and restart unmanaged pods. |
| **kvstore (`etcd`) unhealthy** | `cilium-dbg status` shows `has-quorum: false` or `consecutive-errors`. | Verify `cilium-operator` heartbeat (`cilium/.heartbeat`) and `2379-2380/tcp` connectivity. |

---

## Performance & Scalability Tuning (v1.20)

### High-Performance Profile (Kernel `>= 6.8`, `mlx4`/`mlx5`/`ice` NICs)
```bash
helm install cilium oci://quay.io/cilium/charts/cilium --version 1.20.5 --namespace kube-system \
  --set routingMode=native \
  --set bpf.datapathMode=netkit \
  --set bpf.masquerade=true \
  --set bpf.distributedLRU.enabled=true \
  --set bpf.mapDynamicSizeRatio=0.08 \
  --set ipv6.enabled=true --set enableIPv6BIGTCP=true \
  --set ipv4.enabled=true --set enableIPv4BIGTCP=true \
  --set kubeProxyReplacement=true \
  --set bpfClockProbe=true
```

### Key Tuning Knobs
- **`netkit` device mode (Beta, `kernel >= 6.8`)**: `bpf.datapathMode=netkit` (L3) or `netkit-l2` (uses `tcx` + BPF links). Cannot mix `veth` and `netkit` in-place—deploy on new nodes via `CiliumNodeConfig`.
- **BIG TCP**: `enableIPv6BIGTCP=true` (`kernel >= 5.19`) / `enableIPv4BIGTCP=true` (`kernel >= 6.3`). Requires native routing, eBPF Host-Routing, KPR, eBPF masquerade, **no tunneling/encryption**, and `mlx4`/`mlx5`/`ice` NICs.
- **Bypass iptables Conntrack**: `installNoConntrackIptablesRules=true` (requires native routing + KPR + eBPF/no masquerade). Annotate `hostNetwork` pods with `network.cilium.io/no-track-host-ports: "999/tcp"`.
- **Per-CPU Distributed LRU & Jiffies Clock**: `bpf.distributedLRU.enabled=true` (requires `bpf.mapDynamicSizeRatio`) + `bpfClockProbe=true` (disruptive to change live).
- **Hubble CPU Tuning**: Raise `hubble.eventQueueSize=32768`, increase `bpf.events.monitorInterval="10s"`, or suppress trace events via `bpf.events.trace.enabled=false`.
- **Large Clusters (`1000+` nodes / `50k+` pods)**: Disable `endpointHealthChecking.enabled=false`, `healthChecking=false`, use `scheduling.mode=kube-scheduler`, and prune high-cardinality pod labels via `labels` / `label-prefix-file`.
