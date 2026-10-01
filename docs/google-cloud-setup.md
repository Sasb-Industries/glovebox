# Google Cloud setup

Glovebox talks to the Drive API using **your own** Google Cloud OAuth credentials. This is a one-time setup, about 10 minutes. Only the person who owns the project does it; friends just need to be added as test users.

Google renames these console pages from time to time; if a label doesn't match exactly, look for the closest equivalent.

## 1. Create a project
1. Go to <https://console.cloud.google.com/> and sign in.
2. Use the project picker (top bar) → **New project**. Name it `Glovebox` → **Create**, and make sure it's selected.

## 2. Enable the Drive API
1. Go to **APIs & Services → Library**.
2. Search **Google Drive API** → **Enable**.

## 3. Configure the consent screen
1. Go to **APIs & Services → OAuth consent screen**, also shown as **Google Auth Platform**. Click **Get started** if prompted.
2. **App name:** `Glovebox`. **User support email:** your email.
3. **Audience:** **External**.
4. **Contact information:** your email → agree → **Create**.
5. Under **Audience → Test users**, click **Add users** and add every Gmail address that will use the app, including your own.
   - Leave the publishing status as **Testing**.
6. Under **Data access → Add or remove scopes**, add `https://www.googleapis.com/auth/drive` → **Update** → **Save**.

## 4. Create the OAuth client
1. Go to **Clients** (or **APIs & Services → Credentials**) → **Create client**, or **Create credentials → OAuth client ID**.
2. **Application type:** **Desktop app**. **Name:** `Glovebox desktop` → **Create**.
3. Copy the **Client ID** and **Client secret**.

## 5. Give them to Glovebox
Create a file named `.env` in the repo root. It is git-ignored; never commit it.

```
GLOVEBOX_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GLOVEBOX_GOOGLE_CLIENT_SECRET=your-client-secret
```

## Notes
- **Weekly reconnect:** in Testing mode, Google expires sign-ins after 7 days, so Glovebox will show a **Reconnect** banner about once a week.
- **"Google hasn't verified this app":** expected for test users. Click **Continue**.
- **Work/school accounts:** these may be blocked by the organization's admin. Personal Gmail accounts work.
