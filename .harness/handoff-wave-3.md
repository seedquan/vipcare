# Wave 3 Handoff

## Changes Made

### Task 1: .npmignore
- Created `/.npmignore` excluding `tests/`, `.harness/`, `profiles/`, `skill/`, `.gitignore`, `.git/`
- `bin/`, `lib/`, `package.json`, `README.md` remain in the published package

### Task 2: Fix edit command silent regex failures
- **File:** `bin/vip.js`
- Added `appendNote()` helper function for consistent note appending
- All 4 field replacements (`--title`, `--company`, `--twitter`, `--linkedin`) now compare content before/after regex replace
- If regex does not match (e.g., AI used different formatting), a yellow warning is printed and the value is appended as a note in the `## Notes` section instead of silently doing nothing

### Task 3: Input validation

#### 3a. Profile name validation (`lib/profile.js`)
- Added exported `validateName(name)` function
- Returns `false` for null, undefined, non-strings, empty strings, and names that slugify to `'unnamed'`
- Added 4 test cases in `tests/profile.test.js`

#### 3b. YouTube URL validation (`lib/fetchers/youtube.js`)
- Changed `isYouTubeUrl` from internal function to exported function
- Made validation stricter: now parses with `new URL()`, checks hostname against `youtube.com`/`youtu.be`, and validates pathname starts with `/watch`, `/shorts/`, or is a `youtu.be` short link
- Rejects non-URL strings, non-YouTube domains, and YouTube URLs that aren't video pages (e.g., `/channel/`)
- Added 9 test assertions in `tests/youtube.test.js`

### Task 4: Card fallback for profiles without VIP_DATA
- **File:** `lib/card.js`
- The Sam Altman profile has no `<!-- VIP_DATA ... -->` block (confirmed)
- Updated `generateCards` fallback to parse `# Name`, `> Summary`, `**Title:**`, `**Company:**`, `**Location:**`, and `**Industry:**` from markdown
- Fallback cards now show real name, title, company, location, industry tag, and summary quote instead of all blanks/question marks
- DISC and MBTI remain `?` since they require AI analysis

## Test Results
- All 91 tests pass (`node --experimental-test-module-mocks --test tests/*.test.js`)
- No regressions
