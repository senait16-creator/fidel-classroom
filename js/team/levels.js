A few UI/UX changes I'd like to make after testing the app:

### Fidel Challenge

* Verify that **🏁 Team Race** is actually driven by Supabase/team progress and not just frontend visuals. It should automatically update based on team completion and teacher approval.

* Remove the **ä** pronunciation label completely.

* Update the pronunciation labels used throughout the matching games and Fidel practice to:

  **1:** eh *(except all "ha" families, which should stay "ha")*
  **2:** oo
  **3:** ee
  **4:** ah
  **5:** ay
  **6:** ih
  **7:** o

  Examples:

  * መ → meh
  * ሙ → moo
  * ሚ → mee
  * ማ → mah
  * ሜ → may
  * ም → mih
  * ሞ → mo

  For the ha family:

  * ሀ → ha
  * ሁ → hoo
  * ሂ → hee
  * ሃ → ha
  * ሄ → hay
  * ህ → hih
  * ሆ → ho

* Update every matching game so all **ha** variants are treated as the same sound during sound matching:

  ሀ, ሃ, ሐ, ሓ, ኀ, ኃ

  These should all share the same `soundKey = "ha"`.

* The "You got a match!" / Gobez popups stay on screen too long and slow the game down because they cover the next cards. Either remove them for normal matches or make them disappear much faster. Reserve larger celebrations for milestones like streaks, completing a family, or finishing a level.

* Once a student has all three families approved by their captain, move this card to the **very top** of the Fidel Challenge dashboard:

  ⭐ You cleared all 3 families!
  Submit for teacher approval to advance your team to the next level.

  [Submit for Level Approval]

  This should become the primary call-to-action until teacher approval is complete.

* Remove the standalone "Coming Up / Next Level" section from the current level page. Instead, show the preview (example: መ ሠ ረ) on the **locked Level 2 card**, since that's where it makes more sense.

###

Because all of the Guided Course content now lives in Supabase, I'm wondering if we should eventually move the Fidel letter/pronunciation data there as well instead of keeping it hardcoded in `alphabetData`. That would let us edit pronunciation labels, sound keys, active letters, and level assignments without changing JavaScript every time.
