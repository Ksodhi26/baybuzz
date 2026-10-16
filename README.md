# BayBuzz – What's happening around the Bay

BayBuzz is a free, simple website that lists events across the San Francisco Bay Area.
It is just a handful of files – no servers, no databases, no monthly bill. GitHub hosts it for free
(using a feature called **GitHub Pages**), and a small robot (a **GitHub Action**) refreshes the event
list every morning from Ticketmaster.

> **Right now the site shows SAMPLE events.** They are made up, marked "Sample – not a real event",
> and a yellow "Sample data" banner appears at the top. They disappear automatically the first time
> the daily update runs with your Ticketmaster key (Step 3).

---

## What's in the folder

| File | What it does |
|---|---|
| `index.html` | The web page itself |
| `style.css` | Colors, fonts and layout (works on phones too) |
| `app.js` | Filters, search and the "Add your event" link |
| `events.json` | The list of events the page shows (updated automatically) |
| `feeds.json` | Optional: extra calendar (iCal) links to pull events from |
| `scripts/update_events.py` | The robot's instructions for fetching events |
| `.github/workflows/update.yml` | Tells GitHub to run the robot every day |
| `preview-desktop.png`, `preview-mobile.png` | Screenshots of how the site looks (you can delete these) |

---

## Step 1 – Put the site on GitHub (about 10 minutes, one time)

1. Go to **https://github.com** and create a free account (or sign in).
2. Click the **+** in the top-right corner → **New repository**.
   - Repository name: `baybuzz` (any name works).
   - Choose **Public** (free GitHub Pages needs a public repository).
   - Click **Create repository**.
3. On the new, empty repository page, click the link **"uploading an existing file"**.
4. Open the BayBuzz folder on your computer, select **everything inside it** and drag it into the browser window.
   - ⚠️ The `.github` folder starts with a dot and may be hidden on your computer.
     - **Mac:** in Finder press `Cmd + Shift + .` to show hidden files.
     - **Windows:** in File Explorer choose **View → Show → Hidden items**.
   - If the `.github` folder won't upload by drag-and-drop, see "Adding the workflow file by hand" below.
5. Scroll down and click **Commit changes**.

## Step 2 – Turn on GitHub Pages (2 minutes)

1. In your repository, click **Settings** (top menu) → **Pages** (left menu).
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Under **Branch**, pick **main** and **/ (root)**, then click **Save**.
4. Wait 1–2 minutes and refresh. GitHub shows your address, something like
   `https://YOUR-USERNAME.github.io/baybuzz/`. That's your live website! 🎉

## Step 3 – Add your free Ticketmaster key (5 minutes)

The key lets the robot download real events. It's free.

1. Go to **https://developer.ticketmaster.com**, click **Get your API key**, and create a free account.
2. After signing in, open **My Apps** (sometimes shown under your name). An app is created for you automatically.
3. Copy the **Consumer Key** (a long string of letters and numbers). That is your API key.
   Keep it private – don't paste it into any of the website files.
4. Back on GitHub, in your repository: **Settings → Secrets and variables → Actions**.
5. Click **New repository secret**.
   - **Name:** `TICKETMASTER_API_KEY` (exactly like this)
   - **Secret:** paste your Consumer Key
   - Click **Add secret**.

## Step 4 – Run the first update (1 minute)

1. Click the **Actions** tab at the top of your repository.
   If GitHub asks, click **"I understand my workflows, go ahead and enable them"**.
2. Click **Update events** on the left, then **Run workflow** → **Run workflow** (green button).
3. After a minute or two you'll see a green check ✅. Your `events.json` now has real events,
   the Sample banner is gone, and the website updates a minute or two later.

From now on it runs **automatically every morning (~6 AM Pacific)**. You don't need to do anything.

---

## Everyday tasks

### Set up the "Add your event" button
1. Create a Google Form (https://forms.google.com) asking for event name, date, time, city, venue, link, price, and the person's email.
2. In the form click **Send** → the 🔗 link icon → **Copy**.
3. On GitHub open `app.js`, click the ✏️ pencil icon, and replace the link on this line near the top:
   ```js
   const ADD_EVENT_FORM_URL = "https://forms.gle/REPLACE_WITH_YOUR_GOOGLE_FORM";
   ```
4. Click **Commit changes**. The button now opens your form.

Form submissions arrive in your Google Form responses – they are **not** added to the site automatically.
You review them and decide what to include (see the next section for a simple way).

### Add events from other calendars (optional)
Many cities, libraries and venues publish an iCal calendar link (it usually ends in `.ics`).
You can also make your own Google Calendar of hand-picked events and use its "Public address in iCal format".

Open `feeds.json` on GitHub, click ✏️, and add entries inside the `feeds` list, for example:
```json
{
  "feeds": [
    { "name": "City of San Ramon", "url": "https://example.org/calendar.ics", "city": "San Ramon", "category": "Community", "homepage": "https://example.org/events" }
  ]
}
```
Only `url` is required. `name` is shown as the source credit; `city` and `category` are used when the calendar doesn't say.
Only add calendars you have permission to republish.

### Check that the daily update is working
**Actions** tab → **Update events**. Green ✅ = good. Red ❌ = click it to read the message.
The "Last updated" date at the top of the website also tells you when events were last refreshed.

---

## Troubleshooting

- **Site still shows sample events** – Check that the secret is named exactly `TICKETMASTER_API_KEY`, then run the workflow again (Step 4).
- **Workflow fails with "Permission denied" / "403" when pushing** – Settings → Actions → General → *Workflow permissions* → choose **Read and write permissions** → Save. Run it again.
- **"Ticketmaster rejected the API key"** – The key was copied wrong or isn't active yet. Copy the *Consumer Key* again and update the secret.
- **Daily runs stopped** – GitHub pauses scheduled robots on repositories with no activity for 60 days. Open the Actions tab and click **Enable workflow**.
- **Opening `index.html` by double-clicking shows "couldn't be loaded"** – Browsers block that for local files. It works fine on GitHub Pages. To preview on your own computer, open a terminal in the folder, run `python3 -m http.server 8000`, and visit http://localhost:8000.

### Adding the workflow file by hand
If the hidden `.github` folder didn't upload: on your repository page click **Add file → Create new file**,
type the name `.github/workflows/update.yml` (the slashes create the folders), paste in the contents of
`update.yml` from your computer, and click **Commit changes**.

---

## Good to know

- **Cost:** GitHub Pages, GitHub Actions (for public repositories) and the Ticketmaster API key are all free.
  Ticketmaster's free key allows 5,000 requests a day; BayBuzz uses about 5 per day.
- **Area covered:** everything within 60 miles of Oakland, over the next 60 days, up to 1,000 Ticketmaster events.
- **Attribution:** Ticketmaster's terms require crediting them and linking back – the site does this
  ("Events by Ticketmaster" and a link on every event). Please keep those links. Review the
  Ticketmaster Discovery API terms of use before promoting the site.
- **Accuracy:** event details come from third parties. The footer reminds visitors to verify with the organizer.
- **Custom domain (optional):** you can buy a name like `baybuzz.com` and connect it in Settings → Pages → Custom domain.

### For a helper with technical skills
- Run the updater locally: `pip install requests && TICKETMASTER_API_KEY=xxx python3 scripts/update_events.py`
- With no key and no feeds, the script exits without touching `events.json`. If every source fails or returns nothing, it also leaves the file alone.
- `events.json` format: `{ "lastUpdated", "sources": [{name,url}], "events": [{ id, title, start, end, venue, city, category, price: {min,max,currency}|null, isFree, url, source, description, image, sample? }] }`. Dates are ISO 8601 with Pacific offset, or `YYYY-MM-DD` for all-day.

### Sponsors and analytics
- **Sponsored slot:** add an entry to `sponsors.json`, e.g. `[{"name":"Joe's Tacos","title":"2-for-1 Taco Tuesday","url":"https://example.com","blurb":"Short line.","image":"https://example.com/pic.jpg","until":"2026-12-31"}]` (`image` optional). It shows at the top of the list, labelled "Sponsored", with `rel="sponsored noopener"` links, and hides itself after the `until` date. `[]` = slot hidden. Advertise page: `advertise.html`.
- **Analytics (Cloudflare Web Analytics, free, cookie-free):** get the token from the Cloudflare dashboard → Web Analytics → Add site, then paste it into `CF_ANALYTICS_TOKEN` at the top of `app.js`. While it is empty no analytics script loads.
