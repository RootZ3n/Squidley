<!-- scanner: known-safe internal skill -->
# Skill: http-get-and-http-post-usage
## Usage Scenarios
This skill covers how to use `http.get` and `http.post` methods for making HTTP requests.
## Examples

### GET Request Example
To fetch data from an API endpoint using a GET request:
```bash
response = http.get('https://api.example.com/data', headers={'Accept': 'application/json'})
```

### POST Request Example
To send data to an API endpoint using a POST request:
```bash
body = json.dumps({'key1': 'value1', 'key2': 'value2'})
headers = {'Content-Type': 'application/json'}
response = http.post('https://api.example.com/data', body=body, headers=headers)
```

## Metadata
- created: 2026-03-01
- author: Squidley + Jeff