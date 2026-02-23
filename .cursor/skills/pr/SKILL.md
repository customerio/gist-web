---
name: pr
description: Create or update GitHub pull requests using gh CLI. Use when creating PRs, updating PR titles/descriptions, opening pull requests, or submitting changes for review.
---

# Pull Request Management

## Quick Start

1. **Check authentication**: If `gh` commands fail, unset `GITHUB_TOKEN`:
   ```bash
   unset GITHUB_TOKEN
   ```

2. **Review changes**: Analyze git diff, not commit messages:
   ```bash
   git diff develop...HEAD
   ```

3. **Create or update PR** (use temp file for description to avoid bash syntax issues):
   ```bash
   # Write description to temp file
   echo "Description content" > /tmp/pr-body.txt
   
   # Create new PR
   gh pr create --base develop --title "Title" --body-file /tmp/pr-body.txt
   
   # Update existing PR
   gh pr edit --title "New title" --body-file /tmp/pr-body.txt
   ```

## Workflow

1. Check if PR exists: `gh pr view`
2. Review code changes: `git diff develop...HEAD`
3. Write description to temp file: `echo "..." > /tmp/pr-body.txt`
4. Write title/description based on changes, not commit history
5. Create new PR or update existing one targeting `develop` using `--body-file`
6. If auth fails, unset `GITHUB_TOKEN` and retry

## Commands

- **Create**: Write description to temp file, then `gh pr create --base develop --title "..." --body-file /tmp/pr-body.txt`
- **Update**: Write description to temp file, then `gh pr edit --title "..." --body-file /tmp/pr-body.txt`
- **View**: `gh pr view` (check if PR exists)
- **List**: `gh pr list` (find PR number)

**Always use `--body-file` instead of `--body`** to avoid bash syntax issues in descriptions.

## Best Practices

- **Base branch**: Always `develop`
- **Review scope**: Focus on code diff, ignore commit messages
- **Update existing**: Check for PR first, update if exists
- **Authentication**: Unset `GITHUB_TOKEN` if `gh` auth fails
