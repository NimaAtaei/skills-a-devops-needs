// Zabbix webhook media type — forward problems to an n8n workflow
//
// Media type setup:
//   Name:        n8n automation
//   Type:        Webhook
//   Script:      (this file)
//   Parameters:  webhook_url  = {$N8N_WEBHOOK_URL}   (secret macro or password field)
//                max_events   = 5                  (cap payload size)
//
// Triggered for: Problem / Recovery / Update (configure message templates per
// event type so `value` carries the fields used below).

var req = new HttpRequest();

var MAX_EVENTS = params.max_events ? parseInt(params.max_events, 10) : 5;
var url = params.webhook_url;

if (!url) {
    throw 'Missing webhook_url parameter';
}

req.addHeader('Content-Type: application/json');
req.addHeader('User-Agent: Zabbix-Webhook');

// `value` is the JSON string built by the action's message template —
// parse defensively; a malformed template should fail loudly, not silently.
var event;
try {
    event = JSON.parse(value);
} catch (e) {
    Zabbix.log(3, '[ n8n webhook ] value is not valid JSON: ' + value);
    throw 'Bad message template JSON: ' + e;
}

// Shape a small, stable payload for downstream automation.
// Map Zabbix severities (0..5) to words once, here.
var SEVERITIES = ['not_classified', 'info', 'warning', 'average', 'high', 'disaster'];

var payload = {
    source: 'zabbix',
    event_id: event.event_id || null,
    trigger_id: event.trigger_id || null,
    host: event.host || (event.hosts && event.hosts[0] ? event.hosts[0].host : null),
    name: event.name || event.trigger_name || 'zabbix event',
    status: event.status || 'PROBLEM',          // PROBLEM | RESOLVED | UPDATE
    severity: SEVERITIES[event.severity] || 'not_classified',
    severity_level: typeof event.severity === 'number' ? event.severity : 0,
    tags: event.tags || {},
    age_seconds: event.event_age ? parseInt(event.event_age, 10) : null,
    occurred_at: new Date().toISOString()
};

var body = JSON.stringify(payload);

Zabbix.log(4, '[ n8n webhook ] sending: ' + body);

var response = req.post(url, body);

var status = req.getStatus();
if (status !== 200 && status !== 204) {
    // Throwing marks the notification as failed in the frontend and lets the
    // media type retry policy (Attempts / Attempts interval) take over.
    Zabbix.log(3, '[ n8n webhook ] failed with status ' + status + ': ' + response);
    throw 'n8n delivery failed, HTTP ' + status;
}

Zabbix.log(4, '[ n8n webhook ] delivered, status ' + status);
return 'ok';
