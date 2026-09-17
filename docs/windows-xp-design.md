# Computer Cat: a familiar little friend

The supplied transparent pixel cat is the product's character. Show the whole silhouette on the
desktop, preserve its proportions, and use the same artwork in chat, onboarding, and the tray.

## Design direction

Windows XP's Luna blue, warm gray controls, inset white surfaces, grassy green accents, Tahoma,
and small illustrated icons give the app a familiar home. Apply those details to a spacious,
readable workspace: nostalgia in the chrome, clarity in the content.

- One primary action: talk to the cat. Keep the composer visible throughout a conversation.
- A small, stable sidebar: chat, the desktop companion, and settings. No empty destinations.
- A welcoming home with the cat, a short introduction, and useful starter prompts that populate
  an editable draft. In demo mode, clearly describe the sample conversation.
- Desktop mode closes the chat into the companion. Clicking the cat or using the existing
  shortcut brings the same conversation back. Window controls must perform real window actions.
- Companion settings should actually control its size, presence, and motion. Keep them simple.
- Show streaming, cancellation, connection failures, and stopped replies where they happen.
- Keep keyboard focus visible, respect reduced motion, and support the minimum window size.
- Keep the current privacy model: session-only chat, explicit model configuration, and no screen
  access or computer actions. Describe capabilities truthfully in the UI.

## Product references

These references inform the hierarchy and interaction patterns, without copying their branding.

- [Notion's sidebar](https://www.notion.com/en-gb/help/navigate-with-the-sidebar): a stable place
  to navigate, with a clear current location and secondary detail revealed when needed.
- [Spotify's design history](https://newsroom.spotify.com/2026-04-23/spotify-design-history/):
  recognizable personality with controls that stay familiar as the content changes.
- [Robinhood Legend layouts](https://robinhood.com/us/en/support/articles/layouts-on-legend/):
  a useful starting point and a focused workspace that can adapt to its user.

## Verification

Review real Electron screenshots of home, chat, settings, companion, and the minimum window
size. Exercise keyboard compose, cancellation from both windows, clear chat, window controls,
and validated preferences. Run the repository's offline verification and desktop smoke suite.
