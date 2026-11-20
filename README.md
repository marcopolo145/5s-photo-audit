# 5S Photo Audit (Marcopolo)

Take 4 to 5 photos, add a 4S check, press Submit. You get scores for 1S to 4S (total out of 4), actions with time, a PDF, and the result is saved automatically: one row in the Google Sheet and the PDF in the 5S Drive folder (link in the "Report Link" column).

```
Browser (GitHub Pages)  ->  Supabase (login + Edge Function)  ->  Anthropic or Gemini (scoring)
                                                              ->  Google Apps Script (Sheet row + Drive PDF)
```

Everything here is on free plans except the AI scoring, which is billed per audit by Anthropic. (Gemini's free tier is an alternative.)

## One-time setup

### 1. Google Apps Script (Sheet + Drive)
1. Go to script.google.com, new project, paste `apps-script/Code.gs` (and `appsscript.json` under Project settings > Show manifest).
2. Project settings > Script properties > add `SECRET` = a long random text.
3. Deploy > New deployment > Web app > Execute as **Me**, access **Anyone** > Deploy, and approve the permissions. Copy the Web app URL.
4. The account must be an Editor of the Google Sheet and the 5S Folder.

### 2. Supabase (login + backend)
1. Create a free project at supabase.com.
2. Authentication > URL Configuration: set **Site URL** to the GitHub Pages URL and add it under **Redirect URLs**.
3. Set secrets and deploy the function (from this folder):
```bash
supabase link --project-ref <ref>
supabase secrets set ALLOWED="@yourcompany.com,someone@gmail.com"
supabase secrets set ANTHROPIC_API_KEY=...        # or GEMINI_API_KEY=...
supabase secrets set APPS_SCRIPT_URL="<web app url>" APPS_SCRIPT_SECRET="<SECRET from step 1>"
supabase functions deploy api
```
`ALLOWED` is the list of emails or `@domains` that may use the tool. If it is empty, nobody can.

4. Put the Project URL and anon key in `config.js` and push.

Magic-link emails on Supabase's free built-in mail are limited to a few per hour. For more users, turn on Google sign-in (set `GOOGLE_LOGIN: true`) or add your own SMTP (for example Resend, free tier).

### 3. Hosting
GitHub Pages: Settings > Pages > Deploy from branch `main`, folder `/ (root)`.

## Files
- `index.html`: the app. `runtime.js`: login and backend calls. `config.js`: public settings.
- `supabase/functions/api/index.ts`: the backend function.
- `apps-script/`: the Google side.
