# Skill: weather-report

## Purpose
Fetch and report current weather conditions for Moore, Oklahoma using the Open-Meteo API.
Activate when the user asks about weather, temperature, forecast, rain, or conditions.

## Trigger phrases
- "What's the weather like today?"
- "What's the weather?"
- "Is it going to rain?"
- "What's the temperature?"
- "What's the forecast?"
- "How's the weather in Moore?"

## How to respond
1. Use http.get to fetch from Open-Meteo
2. Parse the response and report temperature, conditions, wind, and humidity
3. Use plain conversational language — no JSON dumps

## API call
URL: https://api.open-meteo.com/v1/forecast?latitude=35.3395&longitude=-97.4867&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago

## Weather code mapping
0=Clear sky, 1-3=Partly cloudy, 45-48=Foggy, 51-67=Rainy, 71-77=Snowy, 80-82=Rain showers, 95=Thunderstorm

## Response format
"Right now in Moore it's [temp]°F, [condition]. Humidity is [humidity]%, winds at [wind] mph."
For forecast add: "Today's high is expected around [max]°F."

## Notes
- Moore, OK coordinates: 35.3395, -97.4867
- Timezone: America/Chicago
- No API key required
