# Storage, Federation & Remote Write/Read

## Local TSDB Architecture

Prometheus stores all data in a custom time-series database (TSDB) under the `--storage.tsdb.path`
directory (default: `./data`).

### Directory Structure

```
data/
├── wal/                    # Write-Ahead Log (128MB segments)
│   ├── 00000001
│   ├── 00000002
│   └── ...
├── chunks_head/            # Memory-mapped head chunks
├── 01BKGV7JBM69T2G1BGBGM6KB12/  # Persistent block
│   ├── chunks/             # Compressed chunk files
│   │   └── 000001
│   ├── index               # Inverted index (label→series→chunk offsets)
│   ├── meta.json           # Block metadata (minTime, maxTime, stats)
│   └── tombstones          # Deletion markers
├── 01BKGTZQ1SYQJTR4PB43C8PD98/  # Another block
│   └── ...
├── lock                    # Process lock file
└── queries.active          # Active query tracking
```

### Data Flow

1. **Head Block**: In-memory buffer for the most recent 2 hours of data
   - Incoming scrape samples are appended to the head block
   - WAL records all writes for crash recovery
2. **WAL (Write-Ahead Log)**: Segmented into 128MB files under `wal/`
   - Ensures durability: on startup, WAL is replayed to restore head block
   - WAL compression enabled with `--storage.tsdb.wal-compression` (snappy)
3. **Block Compaction**: Head block periodically cuts a persistent 2-hour block to disk
   - Smaller blocks are merged during compaction: 2h → 6h → 18h → 54h
   - Compaction reduces index overhead and improves query performance
   - Maximum block range = retention period / 10 (minimum 2h)
4. **Tombstones**: Deletion markers created by the admin API; cleaned up by
   `POST /api/v1/admin/tsdb/clean_tombstones`

### Compression

- **Sample compression**: Gorilla-based encoding — double-delta timestamps + XOR float values
- Typical cost: **1–2 bytes per sample**
- WAL compression: Snappy (optional, enabled via flag)

### Retention

Two retention strategies (can be combined):

| Flag | Default | Description |
|------|---------|-------------|
| `--storage.tsdb.retention.time` | `15d` | Maximum age of blocks (oldest blocks pruned first) |
| `--storage.tsdb.retention.size` | `0` (unlimited) | Maximum total disk size for blocks (e.g., `500GB`) |

When both are configured, whichever limit is hit first triggers block pruning.

> **Note**: The WAL and head block are NOT counted toward `retention.size`. Actual disk
> usage is WAL + head + blocks. Plan for ~20% overhead above the retention.size limit.

### Out-of-Order Ingestion

```yaml
storage:
  tsdb:
    out_of_order_time_window: 30m
```

Allows ingestion of samples with timestamps up to 30 minutes in the past. Useful when
scrape targets or remote write sources deliver data with delays.

### Exemplars

```yaml
storage:
  exemplars:
    max_exemplars: 100000
```

- Circular buffer stored in memory linking metric samples to trace IDs
- Enable with `--enable-feature=exemplar-storage`
- Exemplars are exposed via `/api/v1/query_exemplars`

### TSDB Admin API

Requires `--web.enable-admin-api` flag.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/admin/tsdb/snapshot` | POST | Creates a snapshot of TSDB data. Optional: `skip_head=true` |
| `/api/v1/admin/tsdb/delete_series` | POST | Marks series matching `match[]` for deletion within `start`/`end` |
| `/api/v1/admin/tsdb/clean_tombstones` | POST | Purges deleted (tombstoned) series data from disk |

### Backfilling Historical Data

```bash
# Import OpenMetrics formatted data into TSDB blocks
promtool tsdb create-blocks-from openmetrics <input_file> [--output-dir <path>]

# Backfill recording rule results from existing TSDB data
promtool tsdb create-blocks-from rules \
  --start=2024-01-01T00:00:00Z \
  --end=2024-01-31T00:00:00Z \
  --url=http://localhost:9090 \
  --output-dir=./data \
  rules.yml
```

### TSDB Analysis

```bash
# Analyze block cardinality, churn, and label statistics
promtool tsdb analyze <block_path>

# Example output includes:
# - Total series count
# - Highest cardinality metric names
# - Highest cardinality label names
# - Label value pairs with most series
# - Highest churn (series created/deleted) metrics
```

---

## Federation

Federation allows one Prometheus server to scrape selected time series from another
Prometheus server.

### Federation Endpoint

```
GET /federate?match[]={job="node"}&match[]={__name__=~"job:.*"}
```

- Returns metrics in standard exposition format matching the provided selectors
- Multiple `match[]` parameters are ORed together
- Supports `start` and `end` time parameters

### Hierarchical Federation

Tree structure where edge Prometheus servers scrape local targets and aggregate via
recording rules; a central/regional Prometheus scrapes only the aggregated recording
rules from edges.

```
        ┌────────────────┐
        │  Global Prom   │  Scrapes aggregated metrics
        │  (central)     │  from regional servers
        └───────┬────────┘
       ┌────────┴────────┐
  ┌────┴─────┐     ┌────┴─────┐
  │ Regional │     │ Regional │  Scrapes aggregated metrics
  │ Prom A   │     │ Prom B   │  from edge servers
  └────┬─────┘     └────┬─────┘
  ┌────┴────┐     ┌────┴────┐
  │ Edge    │     │ Edge    │  Scrapes actual targets
  │ Prom 1  │     │ Prom 3  │  Runs recording rules
  │ Prom 2  │     │ Prom 4  │
  └─────────┘     └─────────┘
```

### Federation Scrape Configuration

```yaml
scrape_configs:
  - job_name: 'federate'
    scrape_interval: 60s
    # CRITICAL: must be true to preserve original labels
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{job="node"}'
        - '{__name__=~"job:.*"}'
    static_configs:
      - targets:
          - 'edge-prometheus-1:9090'
          - 'edge-prometheus-2:9090'
```

> **Important**: Always set `honor_labels: true` on federation scrape jobs to preserve
> the original `instance` and `job` labels from the federated server.

### Cross-Service Federation

Team A's Prometheus scrapes a subset of Team B's Prometheus metrics:

```yaml
scrape_configs:
  - job_name: 'team-b-metrics'
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{__name__=~"team_b_.*"}'
    static_configs:
      - targets: ['team-b-prometheus:9090']
```

---

## Remote Write

### Protocol

- **Remote Write 1.0**: Protobuf payload containing `TimeSeries` (labels + samples),
  Snappy-compressed, sent via HTTP POST
- **Remote Write 2.0**: Optimized protocol with string/symbol interning table reducing
  payload size, plus native histogram and exemplar support

### Reliability Guarantees

- Samples are buffered in a WAL-backed queue
- Failed writes are retried with exponential backoff
- On 429 (Too Many Requests): retried by default (`retry_on_http_429: true`)
- On 5xx: retried with backoff
- On 4xx (except 429): NOT retried (indicates client error)

### Queue Tuning

| Parameter | Default | Description |
|-----------|---------|-------------|
| `capacity` | 10000 | In-memory samples per shard before blocking |
| `max_shards` | 50 | Max concurrent sending goroutines |
| `min_shards` | 1 | Min concurrent sending goroutines |
| `max_samples_per_send` | 2000 | Batch size per HTTP request |
| `batch_send_deadline` | 5s | Max time a sample waits before batch send |
| `min_backoff` | 30ms | Initial retry backoff duration |
| `max_backoff` | 5s | Maximum retry backoff duration |
| `retry_on_http_429` | true | Whether to retry on rate-limit responses |

### Remote Write Best Practices

- Use `write_relabel_configs` to filter out unnecessary metrics before sending
- Monitor `prometheus_remote_storage_*` metrics for queue health:
  - `prometheus_remote_storage_samples_pending`: Samples waiting in queue
  - `prometheus_remote_storage_samples_failed_total`: Failed sample sends
  - `prometheus_remote_storage_shards`: Current active shards
  - `prometheus_remote_storage_succeeded_samples_total`: Successfully sent
- If queue fills up (`prometheus_remote_storage_samples_pending` ≈ `capacity * max_shards`),
  increase `max_shards` or `max_samples_per_send`

---

## Remote Read

Extends Prometheus querying to data stored in external systems:

- Queries are forwarded to the remote endpoint when local TSDB doesn't cover the time range
- `read_recent: false` (default) prevents querying remote for data that should be in local head
- `required_matchers` restricts which queries are forwarded (efficiency filter)

---

## Memory Snapshot on Shutdown

Enable with `--enable-feature=memory-snapshot-on-shutdown`:

- On graceful shutdown, writes head block state to a snapshot file
- On next startup, restores from snapshot instead of replaying the entire WAL
- Dramatically reduces startup time for instances with large WAL (minutes → seconds)
