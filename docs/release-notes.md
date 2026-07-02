# ScoreProphet — Release Notes

## July 2026

### What's New

**🕐 Prediction Deadline Warning**
Matches kicking off within 2 hours now show a pulsing amber countdown badge on the predictions page. No more missing the lock because you didn't notice the time.

**📊 Fan Predictions Poll**
Once a match kicks off, the match detail page shows how everyone split their predictions — what % of players went Home, Draw, or Away. See if you went with the crowd or backed the underdog.

**🔍 How Everyone Predicted**
After a match finishes, the match detail page reveals every player's prediction alongside the final score and points earned. Great for settling debates and bragging rights.

**📥 Championship Export**
Championship managers can now download the full prediction history as a CSV file — useful for end-of-tournament summaries, sharing with the group, or keeping a record of the season.

**📱 Install as App**
ScoreProphet can now be added to your phone's home screen like a native app. On iOS: tap Share → Add to Home Screen. On Android: tap the browser menu → Install App.

---

### Fixes & Improvements

**Scoring & Stats**
- Fixed a bug where a player's longest scoring streak would freeze after the first blank match — previous values may have been too low
- Fixed scores for matches decided in extra time being shown as the 90-minute score instead of the final score
- Double chance predictions (1X / X2 / 12) now count towards hot streak and perfect round achievements
- Fixed group stage standings when 3 teams are level on points with circular head-to-head results

**Predictions**
- Tournament winner prediction is now correctly locked once the first match of the competition kicks off
- Knockout stage team selections are properly validated

**Leaderboard**
- Tie-breaking now also considers double chance accuracy, so equal-points players are ranked more fairly

**Reliability**
- Improved error handling across the app — you'll see a friendly message instead of a blank page if something goes wrong loading

**Security & Accounts**
- Usernames now have a cleaner character set (letters, numbers, spaces, hyphens, underscores, dots)
- Various under-the-hood security improvements
