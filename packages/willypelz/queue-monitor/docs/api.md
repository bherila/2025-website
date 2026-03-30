# API Documentation

## Base URL

All API endpoints are prefixed with the configured path (default: `/queue-monitor/api`).

## Authentication

API endpoints inherit the middleware configuration from `config/queue-monitor.php`. Ensure CSRF tokens are included for POST requests.

## Endpoints

### Get Dashboard Statistics

Get aggregated statistics for a time period.

**Endpoint:** `GET /queue-monitor/api/stats`

**Parameters:**
- `minutes` (optional, integer): Time window in minutes (default: 60)

**Example Request:**
```bash
curl -X GET "http://your-app.test/queue-monitor/api/stats?minutes=120"
```

**Example Response:**
```json
{
  "total": 1523,
  "processed": 1487,
  "failed": 36,
  "processing": 0,
  "avg_runtime_ms": 234
}
```

---

### Get Recent Jobs

Retrieve a list of recent jobs.

**Endpoint:** `GET /queue-monitor/api/jobs`

**Parameters:**
- `limit` (optional, integer): Number of jobs to return (default: 50, max: 200)

**Example Request:**
```bash
curl -X GET "http://your-app.test/queue-monitor/api/jobs?limit=100"
```

**Example Response:**
```json
{
  "jobs": [
    {
      "id": 1,
      "job_id": "abc123",
      "uuid": "9d3e4f5a-1234-5678-9abc-def012345678",
      "connection": "database",
      "queue": "default",
      "name": "App\\Jobs\\ProcessOrder",
      "status": "processed",
      "attempts": 1,
      "runtime_ms": 245,
      "started_at": "2026-02-24T10:30:00.000000Z",
      "finished_at": "2026-02-24T10:30:00.245000Z",
      "created_at": "2026-02-24T10:30:00.000000Z"
    }
  ]
}
```

---

### Pause Queue

Pause job processing on a specific queue.

**Endpoint:** `POST /queue-monitor/api/control/pause`

**Request Body:**
```json
{
  "connection": "database",
  "queue": "default"
}
```

**Example Request:**
```bash
curl -X POST http://your-app.test/queue-monitor/api/control/pause \
  -H "Content-Type: application/json" \
  -H "X-CSRF-TOKEN: your-csrf-token" \
  -d '{"connection": "database", "queue": "default"}'
```

**Example Response:**
```json
{
  "success": true,
  "message": "Queue default on database paused."
}
```

---

### Resume Queue

Resume job processing on a paused queue.

**Endpoint:** `POST /queue-monitor/api/control/resume`

**Request Body:**
```json
{
  "connection": "database",
  "queue": "default"
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Queue default on database resumed."
}
```

---

### Throttle Queue

Set a rate limit for job processing.

**Endpoint:** `POST /queue-monitor/api/control/throttle`

**Request Body:**
```json
{
  "connection": "database",
  "queue": "default",
  "rate": 60
}
```

**Parameters:**
- `rate`: Jobs per minute (integer, minimum: 1)

**Example Response:**
```json
{
  "success": true,
  "message": "Queue default throttled to 60 jobs/min."
}
```

---

### Retry Failed Jobs

Retry all failed jobs on a queue.

**Endpoint:** `POST /queue-monitor/api/control/retry`

**Request Body:**
```json
{
  "connection": "database",
  "queue": "default"
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Retrying failed jobs on default."
}
```

---

## Error Responses

### Validation Error

**Status Code:** 422

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "connection": ["The connection field is required."],
    "queue": ["The queue field is required."]
  }
}
```

### Unauthorized

**Status Code:** 401

```json
{
  "message": "Unauthenticated."
}
```

### Forbidden

**Status Code:** 403

```json
{
  "message": "This action is unauthorized."
}
```

---

## JavaScript Example

Using axios in a frontend application:

```javascript
// Configure axios with CSRF token
axios.defaults.headers.common['X-CSRF-TOKEN'] = document.querySelector('meta[name="csrf-token"]').content;

// Get statistics
const stats = await axios.get('/queue-monitor/api/stats?minutes=60');
console.log(stats.data);

// Pause queue
const pauseResponse = await axios.post('/queue-monitor/api/control/pause', {
  connection: 'database',
  queue: 'default'
});

// Get recent jobs
const jobs = await axios.get('/queue-monitor/api/jobs?limit=50');
console.log(jobs.data.jobs);
```

---

## PHP SDK Example

Using Guzzle client:

```php
use GuzzleHttp\Client;

$client = new Client([
    'base_uri' => 'http://your-app.test',
    'headers' => [
        'Accept' => 'application/json',
    ]
]);

// Get stats
$response = $client->get('/queue-monitor/api/stats?minutes=60');
$stats = json_decode($response->getBody(), true);

// Pause queue
$response = $client->post('/queue-monitor/api/control/pause', [
    'json' => [
        'connection' => 'database',
        'queue' => 'default',
    ]
]);
```

---

## Rate Limiting

API endpoints may be rate limited based on your application's middleware configuration. Implement appropriate retry logic with exponential backoff.

## Webhooks (Future Feature)

In a future version, webhooks will be available to notify external systems of queue events:

- Job processed
- Job failed
- Queue paused/resumed
- Threshold alerts

Stay tuned for updates!

