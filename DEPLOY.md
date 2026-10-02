# Put CX CRM ERP on Hostinger Node.js Web App Hosting

This guide takes about 30 minutes. You do it once. After that, every push to GitHub updates the site.

You need a Hostinger plan that includes Node.js web apps (Business Web Hosting or any Cloud plan) and the code in a GitHub repository.

The names of buttons in hPanel change from time to time. If a name below is slightly different, look for the closest one.

## Step 1. Create the MySQL database

1. In hPanel open **Websites**, then **Databases**, then **Management** (it is under the hosting plan).
2. Create a new MySQL database. Give it a database name, a user name and a password.
   Use a password with **letters and digits only**. Symbols such as `@`, `:`, `/`, `#` break the database address.
3. Write down four things. Hostinger adds a prefix, so they look like this:

   | What | Example |
   |---|---|
   | Database name | `u123456789_cx` |
   | User name | `u123456789_cx` |
   | Password | the one you chose |
   | Host | `localhost` |

## Step 2. Make the secret key

The app needs one secret key to encrypt stored passwords. On your Mac open **Terminal** and run:

```
openssl rand -hex 32
```

It prints 64 letters and digits. Copy it. Keep a private copy somewhere safe and never change it later.

## Step 3. Add the web app

1. In hPanel open **Websites** and choose **Add website**, then **Node.js web app** (also shown as **Web Apps**).
2. Choose **Import Git repository** and connect your GitHub account, then select the repository and the branch that holds this code.
3. Choose the domain, for example `crm.yourdomain.com`.
4. Check the build settings:

   | Setting | Value |
   |---|---|
   | Framework | Next.js |
   | Node.js version | 22 |
   | Root directory | `/` (leave empty) |
   | Package manager | npm |
   | Build command | `npm run build` |
   | Output directory | `.next` |
   | Start command, if asked | `npm start` |

5. Add these **environment variables**:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `mysql://USER:PASSWORD@localhost:3306/DATABASE` with your own user, password and database name |
   | `ENCRYPTION_KEY` | the 64 characters from Step 2 |
   | `APP_URL` | `https://crm.yourdomain.com` |

6. Press **Deploy** and wait until the build finishes. It can take several minutes.

## Step 4. Create your company and your login

Open `https://crm.yourdomain.com`. The first start creates all the database tables by itself, then the setup page appears.
Fill in the company name, state, your name, email and a password. This makes you the Super Admin.

Do this straight after deploying. Until it is done, anyone who finds the address could do it.

## Step 5. First things to set

1. **Settings, Company and GST**: address, GSTIN, bank details, document prefix.
2. **Settings, Users**: add each person with a role. Give them their email and temporary password.
3. **Settings, Email and WhatsApp**: add a mailbox so quotations, invoices and reminders can be emailed.
   For a Hostinger mailbox: host `smtp.hostinger.com`, port `465`, secure connection on, and the mailbox address and password. Press "Send test".
4. **Quotations, Services**: add the services you sell with prices.
5. **Finance, Bank accounts**: add the accounts customers pay into.

## Updating

Push new code to the GitHub branch. Hostinger builds and deploys it automatically. Database changes are applied when the app starts. Your data stays.

## Backups

- **Database**: in hPanel open **Databases**, then **phpMyAdmin**, choose the database and use **Export**. Do this every week and keep the file on your own computer. Hostinger also keeps its own backups under **Files, Backups**.
- **Uploaded files**: they are stored in the folder `cx-crm-erp-data/uploads` in the home folder of your hosting account, outside the app folder, so deployments do not delete them. Download that folder with the hPanel **File Manager** when you back up.
- Keep a private copy of `ENCRYPTION_KEY`. Without it the stored website passwords cannot be read.

## If something does not work

| What you see | What to do |
|---|---|
| The build fails | Open the deployment log in hPanel and read the last lines. If it stops for lack of memory or time, add the environment variable `SKIP_TYPECHECK` with the value `1` and deploy again. |
| "The app is not set up yet. DATABASE_URL is not set" | Add the environment variable and redeploy. |
| "The database cannot be reached: the user name or password was refused" | Check the user and password in `DATABASE_URL`. If the password has symbols, change it to letters and digits. |
| "The database cannot be reached: the database name is wrong, or this user may not use that database" | Check the database name, including the `u123456789_` prefix, and that the user was created for that database. |
| "The database cannot be reached: the database server did not answer" | Change the host in `DATABASE_URL` from `localhost` to `127.0.0.1`, or to the host name hPanel shows for the database. |
| You are signed out straight after signing in | Check that `APP_URL` starts with `https://` and matches the address in the browser. |
| Emails are not sent | Open Communication, Messages. Each failed email shows the reason from the mail server. |
