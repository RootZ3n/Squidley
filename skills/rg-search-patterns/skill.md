# Skill: rg-search-patterns
## Purpose
Provides best practices and common patterns for using rg.search effectively in Squidley to search codebases.

## Common Patterns
Use `rg --case-insensitive` to ignore case sensitivity while searching.
Utilize `rg -g '!{dir}'` to exclude directories from the search scope.

## Useful Flags
- `-i`: Case insensitive search.
- `-g <glob>!`: Exclude patterns using negated glob patterns.
- `-t <type>`: Search files by type, e.g., `-t py` for Python files only.

## Examples
Search all .py files ignoring case:
```
rg -i "function_name" --type python
```
Exclude tests directory while searching:
```
rg "pattern" -g '!tests'
```

## Metadata
- created: 2026-03-01
- author: Squidley + Jeff