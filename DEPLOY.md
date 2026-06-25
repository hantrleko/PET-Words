# PET Kids Deployment

This project is a static website. Deploy the contents of this folder as-is:

- `index.html`
- `css/`
- `js/`
- `vocab-data.js`
- optional duplicate root `app.js`

No build step is required.

## Option A: GitHub Pages

1. Create a GitHub repository, for example `pet-kids-vocab-site`.
2. From this folder, run:

```powershell
git init
git add .
git commit -m "Initial static site"
git branch -M main
git remote add origin https://github.com/YOUR_USER/pet-kids-vocab-site.git
git push -u origin main
```

3. In GitHub, open the repository settings:
   `Settings -> Pages -> Build and deployment -> Source: Deploy from a branch`.
4. Choose branch `main`, folder `/root`, then save.
5. The site will be available at:
   `https://YOUR_USER.github.io/pet-kids-vocab-site/`

## Option B: Cloudflare Pages

Use Direct Upload or connect a GitHub repository.

For direct upload with Wrangler:

```powershell
npx wrangler pages project create pet-kids-vocab-site --production-branch main
npx wrangler pages deploy . --project-name pet-kids-vocab-site
```

Wrangler will ask you to log in to Cloudflare if needed.

## Option C: Netlify

Open Netlify, create a new site from files, and drag this whole folder into the upload area.

Build command: leave empty.
Publish directory: `/` or this folder.
