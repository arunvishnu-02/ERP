# Put CX CRM ERP on a Hostinger VPS

This guide takes about 30 minutes. You do it once.

## What you need

1. **A Hostinger VPS plan.** KVM 2 is a good size for a 10-person team; KVM 1 also works.
   The app needs PostgreSQL, so the "Web hosting" and "Node.js app" plans will not work. It must be a VPS.
2. **Operating system: Ubuntu 24.04.** When Hostinger asks, choose "Ubuntu 24.04" or "Ubuntu 24.04 with Docker".
3. **A domain or subdomain**, for example `crm.yourdomain.com`.
4. The file `cx-crm-erp.zip`.

## Step 1. Point your domain to the server

In hPanel open your VPS and copy its IP address.
Then open the DNS settings of your domain and add this record:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | crm | your VPS IP address | 300 |

Wait about 10 minutes for it to take effect.

## Step 2. Copy the zip file to the server

On your own computer, open Terminal (Mac) or PowerShell (Windows) in the folder that has the zip file. Run:

```
scp cx-crm-erp.zip root@YOUR_VPS_IP:/opt/
```

It asks for the root password you set in hPanel.

If the code is on GitHub, you can skip the zip. In Step 3, replace the `unzip` lines with:

```
apt-get update && apt-get install -y git
git clone https://github.com/arunvishnu-02/ERP.git /opt/cx-crm-erp
```

## Step 3. Install

Connect to the server:

```
ssh root@YOUR_VPS_IP
```

Then run these four lines. Put your own domain in the last line.

```
apt-get update && apt-get install -y unzip
cd /opt && unzip cx-crm-erp.zip
cd /opt/cx-crm-erp
bash deploy/install.sh crm.yourdomain.com
```

The script installs Docker if it is missing, creates the secret keys, builds the app and starts it.
The first build takes 5 to 10 minutes. At the end it prints "CX CRM ERP is running".

## Step 4. Create your company and your login

Open `https://crm.yourdomain.com` in your browser. The setup page appears.
Fill in the company name, state, your name, email and a password. This makes you the Super Admin.

Do this straight after installing. Until it is done, anyone who finds the address could do it.

## Step 5. First things to set

1. **Settings, Company and GST**: address, GSTIN, bank details, document prefix.
2. **Settings, Users**: add each person with a role. Give them their email and temporary password.
3. **Settings, Email and WhatsApp**: add a mailbox so quotations, invoices and reminders can be emailed.
   For a Hostinger mailbox: host `smtp.hostinger.com`, port `465`, secure connection on, and the mailbox address and password. Press "Send test".
4. **Quotations, Services**: add the services you sell with prices.
5. **Finance, Bank accounts**: add the accounts customers pay into.

## Step 6. Turn on nightly backups

On the server run `crontab -e` and add this line at the bottom:

```
30 2 * * * cd /opt/cx-crm-erp && bash deploy/backup.sh >> backups/backup.log 2>&1
```

Every night at 2:30 it saves the database and uploaded files into `/opt/cx-crm-erp/backups` and keeps the last 14.
Once a week, copy that folder to your own computer:

```
scp -r root@YOUR_VPS_IP:/opt/cx-crm-erp/backups ./cx-backups
```

Also keep a private copy of `/opt/cx-crm-erp/.env`. It holds the secret keys. Without `ENCRYPTION_KEY`, the stored website passwords cannot be read.

## Everyday commands

Run these on the server, inside `/opt/cx-crm-erp`.

| What you want | Command |
|---|---|
| See if everything is running | `docker compose ps` |
| See errors | `docker compose logs api --tail 100` |
| Restart | `docker compose restart` |
| Stop | `docker compose down` |
| Start | `docker compose up -d` |
| Back up now | `bash deploy/backup.sh` |
| Put a backup back | `bash deploy/restore.sh backups/db-....sql.gz backups/uploads-....tar.gz` |

## Updating to a newer version

1. Copy the new zip to the server and unzip it over the old folder: `cd /opt && unzip -o cx-crm-erp.zip`
2. Run `cd /opt/cx-crm-erp && bash deploy/update.sh`

It makes a backup first, then rebuilds. Your data and your `.env` file are kept.

## If something does not work

- **The page does not open.** Check that the A record points to the VPS IP, and that ports 80 and 443 are allowed if you turned on the Hostinger VPS firewall.
- **"Not secure" warning.** The HTTPS certificate is issued a minute or two after the domain starts pointing to the server. Check with `docker compose logs caddy --tail 50`.
- **Trying it without a domain.** Run `bash deploy/install.sh` with no domain. The app opens at `http://YOUR_VPS_IP`. Run the script again with the domain when it is ready.
- **Emails are not sent.** Open Communication, Messages. Each failed email shows the reason from the mail server.
