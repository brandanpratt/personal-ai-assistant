# Email setup (stage 0)

Before the `email` skill can read your mail, Google and Microsoft each need to know about it. You register it once with each, and they give you a **client ID**. That ID identifies the app, not you. You still sign in with your own account later, on Google's and Microsoft's own pages, and the assistant never sees your password.

Allow about 10 minutes for Gmail and 15 for Outlook. Both are free.

At the end you'll have three values for `.env`:

```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
OUTLOOK_CLIENT_ID=...
```

## What access you're granting

| Account | Permission | What it allows |
|---|---|---|
| Gmail | `gmail.readonly` | Read messages and settings. It can't send, delete, archive, label or mark anything as read. |
| Outlook | `Mail.Read` | Read mail. It can't send, delete, move or flag anything. |
| Outlook | `offline_access` | Stay signed in, so you don't log in on every run. |
| Outlook | `User.Read` | Read your name and email address, to show which account is connected. |

These limits are enforced by Google and Microsoft, so a bug in this code can't go beyond them.

You choose the permissions when you sign in, not here. If the assistant gets more abilities later (for example, archiving newsletters), you add the permission and sign in again. You won't need to redo this setup.

---

## Gmail

### 1. Create a project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with the Gmail account you want the assistant to read.
2. Open the project picker at the top left, then click **New project**.
3. Name it `personal-ai-assistant`. Leave the organization as **No organization**, then click **Create**.
4. Make sure the new project is selected in the picker.

### 2. Turn on the Gmail API

1. Open the menu (☰), then **APIs & Services → Library**.
2. Search for **Gmail API**, open it and click **Enable**.

### 3. Set up the consent screen

This is the "Allow this app to read your email?" page you'll see when you sign in.

1. Open the menu (☰), then **Google Auth Platform**. If it says it isn't configured yet, click **Get started**.
2. **App information:** use `Personal AI Assistant` as the app name and your Gmail address as the support email.
3. **Audience:** choose **External**. "Internal" only exists for Google Workspace organizations.
4. **Contact information:** your Gmail address.
5. Agree to the policy, then click **Create**.

### 4. Add the read-only permission

1. In **Google Auth Platform**, open **Data Access**, then click **Add or remove scopes**.
2. Find `https://www.googleapis.com/auth/gmail.readonly` (search for "gmail.readonly") and tick it.
3. Click **Update**, then **Save**.

### 5. Publish the app (avoids signing in every week)

1. In **Google Auth Platform**, open **Audience**.
2. Under **Publishing status**, click **Publish app**, then confirm.

Why: while the app is in **Testing**, Google signs you out of Gmail access every 7 days. **In production** removes that limit.

Publishing doesn't make your mail visible to anyone. Each account still has to sign in and approve access itself, and only you have the client ID. Google hasn't reviewed the app, so at sign-in you'll see **"Google hasn't verified this app."** Click **Advanced**, then **Go to Personal AI Assistant (unsafe)**. That warning is expected for a personal app.

### 6. Create the client ID

1. In **Google Auth Platform**, open **Clients**, then click **Create client**.
2. Set **Application type** to **Desktop app** and the name to `assistant-cli`.
3. Click **Create**.
4. **Copy both the Client ID and the Client secret right away.** Google shows the secret only once. Afterwards it shows just the last four characters. Put them in `.env`:

   ```
   GMAIL_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=GOCSPX-...
   ```

For a desktop app the "secret" isn't truly secret, because Google knows it ships inside programs on people's computers. Your mail is protected by your own sign-in. Still, keep it in `.env`, which git ignores, and never commit it.

If you lose the secret, open the client, add a new secret, and delete the old one.

---

## Outlook (personal account)

### 1. Get a free Microsoft Entra directory

Microsoft only lets you register apps inside a directory, which it calls a tenant. Personal accounts don't come with one, so you create a free one.

1. Go to [entra.microsoft.com](https://entra.microsoft.com) and sign in with your Outlook/Hotmail account.
2. If you land on the admin center with a directory already shown at the top right, skip to step 2.
3. If it says you have no directory or no access, create a free Azure account at [azure.microsoft.com/free](https://azure.microsoft.com/free) using the same Outlook account. Microsoft asks for a phone number and a card to verify your identity. Registering an app costs nothing. Afterwards, go back to entra.microsoft.com.

### 2. Register the app

1. Go to **Identity → Applications → App registrations → New registration**. The menu may just say **Applications**.
2. **Name:** `Personal AI Assistant`.
3. **Supported account types:** choose **Personal Microsoft accounts only**.
4. **Redirect URI:** leave it empty. The assistant signs in with a short code you type in your browser, so it doesn't need one.
5. Click **Register**.

### 3. Allow sign-in from a terminal app

1. In your new app, open **Authentication**.
2. Find **Allow public client flows** (under **Advanced settings**, or on the **Settings** tab in the newer layout) and set it to **Yes**.
3. Click **Save**.

Without this, sign-in fails with an error about a missing `client_secret`.

### 4. Add the read-only permissions

1. Open **API permissions**. `User.Read` is already listed.
2. Click **Add a permission → Microsoft Graph → Delegated permissions**.
3. Tick **Mail.Read** and **offline_access**, then click **Add permissions**.
4. Skip **Grant admin consent**. Personal accounts approve access themselves when they sign in.

### 5. Copy the client ID

1. Open **Overview**.
2. Copy the **Application (client) ID** into `.env`:

   ```
   OUTLOOK_CLIENT_ID=00000000-0000-0000-0000-000000000000
   ```

Outlook needs no client secret. Don't create one under **Certificates & secrets**, because the assistant is a public client.

---

## Checklist

- [ ] Gmail API enabled
- [ ] Consent screen created, `gmail.readonly` added, app **In production**
- [ ] Desktop client created; `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in `.env`
- [ ] Entra app registered for **Personal Microsoft accounts only**
- [ ] **Allow public client flows** set to Yes
- [ ] `Mail.Read` and `offline_access` added
- [ ] `OUTLOOK_CLIENT_ID` in `.env`
- [ ] `git status` doesn't list `.env`

Once stage 1 is built, `npm run dev -- email connect gmail` and `npm run dev -- email connect outlook` will use these values to sign you in.

## Troubleshooting

| Message | Fix |
|---|---|
| **Access blocked: … has not completed the Google verification process** | The app is still in Testing and your account isn't a test user. Publish it (Gmail step 5), or add yourself under **Audience → Test users**. |
| **Google hasn't verified this app** | Expected. Click **Advanced → Go to Personal AI Assistant (unsafe)**. |
| **Error 403: access_denied** right after approving | The Gmail API isn't enabled in this project (Gmail step 2), or you're in the wrong project. |
| Gmail access stops working after about a week | The app is still in Testing. Publish it (Gmail step 5), then connect again. |
| **AADSTS7000218 … client_assertion or client_secret** | **Allow public client flows** isn't on (Outlook step 3). |
| **AADSTS700016 … application not found** or **unauthorized_client … not enabled for consumers** | The account type isn't **Personal Microsoft accounts only**. Fix it under **Authentication → Supported accounts**, or register again. |
| entra.microsoft.com says you have no access | You don't have a directory yet (Outlook step 1). |
