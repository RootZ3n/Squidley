# Tabularium Library Boundary

Tabularium owns browser-local receipt contracts and storage helpers.

Belongs here:

- receipt schema
- receipt sanitization
- localStorage parsing
- filters/search/export helpers
- gateway receipt mapping helpers

Does not belong here:

- server-side logging
- telemetry upload
- raw prompt or image storage
- module-specific business logic beyond safe receipt metadata
