# Pi-Mesh TODO

## Security Hardening (from review)
- [ ] Validate `from` field on message receive against registry PID
- [ ] Reject absolute paths and `../` escapes in reservation patterns
- [ ] Consider flock-based locking for registration writes (or O_EXCL for atomic creation)
- [ ] Resolve symlinks in pathMatchesReservation

## Robustness (from edge case review)
- [ ] Periodic re-registration check (detect ghost state when reg file deleted)
- [ ] Add max message text length in sendMessage()
- [ ] Periodic feed pruning (not just on join) + file size cap
- [ ] Tail-based reading for feed.jsonl instead of full file read
- [ ] Batch limit for inbox processing (process N per tick, yield, continue)

## Test Coverage
- [ ] Unicode/emoji visual width handling in renderer (needs string-width)

## Code Quality
- [ ] Rename vague commit 0b226a4 if history is ever rebased
