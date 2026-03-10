# Skill: apps
## Purpose
Provides knowledge on managing applications including installation, configuration, and troubleshooting.

## Installation Examples
- Install Docker: `sudo apt-get install docker.io`
- Install Node.js via nvm: `nvm install node`

## Configuration Patterns
- Set environment variables for an app: `export APP_ENV=production`
- Configure a service in `/etc/app/config.yml` with YAML syntax

## Troubleshooting Tips
- Check logs: `journalctl -u app.service`
- Restart application: `systemctl restart app.service`

## Metadata
- created: 2026-03-08
- author: Squidley + Jeff