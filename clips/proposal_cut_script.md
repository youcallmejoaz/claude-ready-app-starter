# Proposal cut: script

60 to 90 seconds, built only from the Phase 3 clips. Neutral narrator, no captions, no music.
Rendered by `clips/render_proposal_cut.py`.

| Scene | Clips | Narration |
|---|---|---|
| 1 | K01 | You want to build your app with Claude Code. But without a solid foundation, every change is a risk, and Claude cannot see your business data. |
| 2 | C01, C02 | This foundation gives you a real app with Google sign in, and your Google Ads and Analytics numbers synced into your own database every day. |
| 3 | C03, K02 | Every change goes to a password protected staging site first. Production only updates when you approve it. |
| 4 | C04 | Now Claude can answer questions about your marketing, like which campaign gets the cheapest conversions, through a private connector. |
| 5 | C05, C06 | And it can only read. Anything that tries to change your data is blocked, and logged. |
| 6 | C07 | Claude Code also gets a project guide, so every session starts knowing how your app works. |
| 7 | K04 | If you want your app set up like this, reply to this proposal, and we can map it to your stack. |

Rules applied: scene length = narration + 0.5 s; UI scenes 2 to 6 may breathe up to 1.5 s more;
clips are trimmed or hold their last frame, never sped up by more than 1.25x; hard cuts, with a
0.3 s crossfade from a card into UI; a slow 5 percent push in on shots longer than 8 seconds;
voice loudness normalised to about -16 LUFS.
