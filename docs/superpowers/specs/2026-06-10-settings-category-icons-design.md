# Settings Category Icons Design

## Scope

Move the language selector from Account to General and add a distinct line icon to every settings category.

## Design

- General contains close behavior followed by language.
- Account contains only account identity and sign-out.
- Every category definition includes an icon component from the existing Kumo icon set.
- Navigation icons inherit the normal muted color and the configured accent color in the active state.
- The compact horizontal navigation keeps the same icon and label arrangement.

## Verification

A source-level regression test checks that category definitions include icons, navigation renders each icon, language is inside the General panel, and Account no longer owns the language row.
