# Naming Policy: `axxx_bbb_ccc_dd`

This repository now uses a unified naming convention for new and renamed backend/frontend symbols we control.

## Required Pattern

- Regex: `^a[a-z0-9]*(?:_[a-z0-9]+){3,}$`
- Format example: `axxx_bbb_ccc_dd`
- Minimum segments: 4 (the first segment must start with `a`)

## Applies To

- New/renamed backend service functions
- New/renamed DTO/model identifiers
- New/renamed route helper identifiers
- New/renamed frontend API adapter identifiers
- New/renamed machine-owned JSON keys/contracts

## Exclusions

- Third-party API fields and upstream library identifiers
- Legacy unchanged symbols (migrated incrementally)
- Framework-required names that are externally constrained

## Validation

- Run `npm run check:naming`
- CI should run `npm run check` (now includes naming validation)

