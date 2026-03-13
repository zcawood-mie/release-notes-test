#!/usr/bin/env bash
# build-release-notes-prompt.sh
#
# Stage 1: Gather PR context for release notes generation.
# Extracts merged PRs since the last tag, fetches metadata via GitHub API,
# and writes per-PR prompt files + a combine prompt for the AI.
#
# Usage: ./build-release-notes-prompt.sh [options]
#   --owner OWNER              GitHub repo owner (required)
#   --repo REPO                GitHub repo name (required)
#   --default-branch BRANCH    Default branch name (default: main)
#   --since-ref REF            Git ref to diff from (default: last tag)
#   --max-files-per-pr N       Max files to include per PR (default: 20)
#   --max-body-chars N         Max PR body characters (default: 1000)
#   --max-patch-chars N        Max total diff characters per PR (default: 100000)
#   --output-dir DIR           Directory for prompt files (default: /tmp/release-notes)
#
# Requires: gh (GitHub CLI), git, jq

set -euo pipefail

# ---------- defaults ----------
OWNER=""
REPO=""
DEFAULT_BRANCH="main"
SINCE_REF=""
MAX_FILES_PER_PR=20
MAX_BODY_CHARS=1000
MAX_PATCH_CHARS=100000
OUTPUT_DIR="/tmp/release-notes"

# ---------- parse args ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner)          OWNER="$2";          shift 2 ;;
    --repo)           REPO="$2";           shift 2 ;;
    --default-branch) DEFAULT_BRANCH="$2"; shift 2 ;;
    --since-ref)      SINCE_REF="$2";      shift 2 ;;
    --max-files-per-pr) MAX_FILES_PER_PR="$2"; shift 2 ;;
    --max-body-chars) MAX_BODY_CHARS="$2"; shift 2 ;;
    --max-patch-chars) MAX_PATCH_CHARS="$2"; shift 2 ;;
    --output-dir)     OUTPUT_DIR="$2";     shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$OWNER" || -z "$REPO" ]]; then
  echo "Error: --owner and --repo are required" >&2
  exit 1
fi

# ---------- resolve since ref ----------
if [[ -z "$SINCE_REF" ]]; then
  SINCE_REF=$(git describe --tags --abbrev=0 2>/dev/null || true)
  if [[ -z "$SINCE_REF" ]]; then
    echo "Warning: No tags found. Using first commit as baseline." >&2
    SINCE_REF=$(git rev-list --max-parents=0 HEAD)
  fi
fi

echo "Range: ${SINCE_REF}..${DEFAULT_BRANCH}"

# ---------- extract PR numbers ----------
# Merge commits: "Merge pull request #123 from ..."
# Squash merges: subject line containing "#123"
PR_NUMBERS=$(
  git log "${SINCE_REF}..${DEFAULT_BRANCH}" --pretty="%s" |
    grep -oE '#[0-9]+' |
    tr -d '#' |
    sort -un
)

if [[ -z "$PR_NUMBERS" ]]; then
  echo "No PRs found in range ${SINCE_REF}..${DEFAULT_BRANCH}" >&2
  exit 0
fi

PR_COUNT=$(echo "$PR_NUMBERS" | wc -l | tr -d ' ')
echo "Found ${PR_COUNT} PR(s): $(echo "$PR_NUMBERS" | tr '\n' ' ')"

# ---------- prepare output directory ----------
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# ---------- per-PR context assembly ----------
for PR_NUM in $PR_NUMBERS; do
  echo "Fetching PR #${PR_NUM}..."

  PROMPT_FILE="${OUTPUT_DIR}/pr-${PR_NUM}-prompt.txt"

  # Fetch PR metadata (title, body, merge commit SHA)
  PR_JSON=$(gh api "/repos/${OWNER}/${REPO}/pulls/${PR_NUM}" \
    --jq '{title: .title, body: .body, merge_commit_sha: .merge_commit_sha, state: .state, merged: .merged}' \
    2>/dev/null || echo '{}')

  PR_TITLE=$(echo "$PR_JSON" | jq -r '.title // "Unknown"')
  PR_BODY=$(echo "$PR_JSON" | jq -r '.body // ""' | head -c "$MAX_BODY_CHARS")
  MERGE_SHA=$(echo "$PR_JSON" | jq -r '.merge_commit_sha // "unknown"')
  PR_STATE=$(echo "$PR_JSON" | jq -r '.state // "unknown"')
  PR_MERGED=$(echo "$PR_JSON" | jq -r '.merged // false')

  # Skip PRs that aren't merged
  if [[ "$PR_MERGED" != "true" ]]; then
    echo "  Skipping PR #${PR_NUM} (state: ${PR_STATE}, merged: ${PR_MERGED})"
    continue
  fi

  # Fetch changed files with diffs
  FILES_JSON=$(gh api "/repos/${OWNER}/${REPO}/pulls/${PR_NUM}/files" \
    --jq "[.[:${MAX_FILES_PER_PR}][] | {filename, status, additions, deletions, patch}]" \
    2>/dev/null || echo '[]')

  FILE_COUNT=$(echo "$FILES_JSON" | jq 'length')
  FILES_SUMMARY=$(echo "$FILES_JSON" | jq -r '.[] | "\(.status)\t+\(.additions)/-\(.deletions)\t\(.filename)"')

  # Build diff content, capped at MAX_PATCH_CHARS total
  DIFF_CONTENT=""
  DIFF_CHARS=0
  while IFS= read -r FILE_ENTRY; do
    FNAME=$(echo "$FILE_ENTRY" | jq -r '.filename')
    PATCH=$(echo "$FILE_ENTRY" | jq -r '.patch // empty')
    if [[ -z "$PATCH" ]]; then
      continue
    fi
    SECTION=$(printf '\n--- %s ---\n%s' "$FNAME" "$PATCH")
    SECTION_LEN=${#SECTION}
    NEW_TOTAL=$((DIFF_CHARS + SECTION_LEN))
    if [[ $NEW_TOTAL -gt $MAX_PATCH_CHARS ]]; then
      REMAINING=$((MAX_PATCH_CHARS - DIFF_CHARS))
      if [[ $REMAINING -gt 200 ]]; then
        DIFF_CONTENT+=$(printf '\n--- %s (truncated) ---\n%s' "$FNAME" "${PATCH:0:$REMAINING}")
      fi
      DIFF_CONTENT+=$'\n[diff capped at '"${MAX_PATCH_CHARS}"$' chars]'
      break
    fi
    DIFF_CONTENT+="$SECTION"
    DIFF_CHARS=$NEW_TOTAL
  done < <(echo "$FILES_JSON" | jq -c '.[]')

  # Build the per-PR prompt
  cat > "$PROMPT_FILE" <<PROMPT_EOF
You are writing release notes for ${OWNER}/${REPO}.

Analyze this single PR and produce exactly ONE release note line, or output OMIT if it should be excluded.

## PR #${PR_NUM}: ${PR_TITLE}
Merge commit: ${MERGE_SHA}

### PR Description
${PR_BODY}

### Files Changed (${FILE_COUNT} files)
${FILES_SUMMARY}

### Diffs
${DIFF_CONTENT}

## Rules
- Write exactly ONE concise release note line describing what this PR does
- Describe from the perspective of the codebase AFTER the merge, not during development
- If commits within the PR fix code born in the same PR, ignore those fixes — the feature shipped working
- Cross-check the actual code diffs against the PR title and description; if they don't match, add [unverified]
- Output OMIT (just that word, nothing else) for: submodule bumps, lockfile-only updates, CI-only config changes, dependency-only updates with no functional change
- Do NOT mention internal PR commits, development process, or bug fixes for bugs that only existed within the PR

## Output Format
Line 1: - {description} ([PR #${PR_NUM}](https://github.com/${OWNER}/${REPO}/pull/${PR_NUM}); [\`${MERGE_SHA:0:7}\`](https://github.com/${OWNER}/${REPO}/commit/${MERGE_SHA}))
Line 2: TYPE:feature OR TYPE:fix
OR just: OMIT
PROMPT_EOF

  echo "  Wrote prompt for PR #${PR_NUM} (${FILE_COUNT} files, ${#PR_BODY} chars body)"
done

# ---------- write combine prompt ----------
COMBINE_FILE="${OUTPUT_DIR}/combine-prompt.txt"
cat > "$COMBINE_FILE" <<'COMBINE_EOF'
You are finalizing release notes. Below are individual PR summaries that have already been written.

## Rules
- Do NOT rewrite, rephrase, or embellish any line — use them exactly as provided
- Group lines under two headings: "## New Features" and "## Bug Fixes"
- Use the TYPE: annotation on each entry to determine grouping, then strip the TYPE: line
- If a line says OMIT, exclude it entirely
- If there are no entries for a heading, omit that heading
- Add a blank line between headings
- Do not add any introduction, conclusion, or commentary

## PR Summaries
COMBINE_EOF

echo ""
echo "Done. Prompt files written to ${OUTPUT_DIR}/"
echo "  Per-PR prompts: $(ls "${OUTPUT_DIR}"/pr-*-prompt.txt 2>/dev/null | wc -l | tr -d ' ')"
echo "  Combine prompt: ${COMBINE_FILE}"
