# Hosting for testing (Render, ~10 minutes)

The platform is one Node process + JSON files in `data/`. The repo carries a
`Dockerfile` (Playwright image → server-side PDF works) and a `render.yaml`
Blueprint (web service + 1 GB persistent disk for `data/`).

## 1. Put the code in GitHub (once)

    unzip flarize_simple_2026-09-10.zip && cd flarize
    git init -b main
    git add -A
    git commit -m "Flarize BOM platform — UAT build 2026-09-12"
    # create an EMPTY private repo on GitHub first, e.g. goldenray26/flarize-bom
    git remote add origin https://github.com/goldenray26/flarize-bom.git
    git push -u origin main

## 2. Create the service (Render dashboard)

1. https://dashboard.render.com → **New +** → **Blueprint**.
2. Pick the repo `goldenray26/flarize-bom` (the Render GitHub app is already connected to this org).
3. Render reads `render.yaml`, asks for **ADMIN_PASSWORD** → type the admin password you want → **Apply**.
4. First build ≈ 4–6 min (pulls the Playwright image). URL: `https://flarize-bom-uat.onrender.com`.

Plan: `render.yaml` uses **starter** (paid, ~$7/mo) because a persistent disk needs
a paid instance. For a throw-away test on the **free** plan: set `plan: free` and
delete the `disk:` block — then every restart resets `data/` to the shipped files
(saved quotations / pack edits are lost).

## 3. Log in

* `/login.html` → `admin` + the ADMIN_PASSWORD you entered.
* Other seeded users: `sales1`, `projhead1`, `procurement1`, `eng1` (passwords as in the previous bundle; reset them from Admin → Users if needed).

## 4. Updating

Push to `main` → Render redeploys automatically. `data/` on the disk is kept.

## Env vars

| key | value | why |
|---|---|---|
| `ADMIN_PASSWORD` | your choice | seeds the admin user on first boot; required |
| `PRODUCTION_MODE` | `false` | UAT (true = production commercial freeze rules) |
| `DATA_DISK` | `/var/data` | where `deploy/render-start.sh` seeds + symlinks `data/` |
