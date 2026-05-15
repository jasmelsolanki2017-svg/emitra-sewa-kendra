# Supabase Setup

This project is currently a static HTML site with an Express `server.js`, not a Next.js App Router project.

Run this after Node/NPM is available on the machine:

```powershell
npm install
```

The dependencies are already listed in `package.json`:

- `@supabase/supabase-js`
- `@supabase/ssr`

Environment values are in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://wjzutgwmdrtlhmgebmua.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_MbH1WNIeOHFkVqI13peLpg_TFgzfFjW
```

Server-side helper:

```js
const { createSupabaseClient } = require("./utils/supabase/server");
const supabase = createSupabaseClient();
```

Static-browser config helper:

```html
<script src="utils/supabase/browser.js"></script>
```

## User Upload Storage

User document uploads now target Supabase Storage bucket:

```text
user-files
```

Uploaded object path format:

```text
<firebase-uid>/<firebase-file-id>-<safe-file-name>
```

Firebase Realtime Database still stores metadata under:

```text
memberFiles/<firebase-uid>/<file-id>
members/<firebase-uid>/storageUsedBytes
```

Create a Supabase Storage bucket named `user-files`. If you want browser downloads to work with the current public URL flow, make the bucket public or add policies that allow reading selected files.

Important security note: this static site uses Firebase Auth, but Supabase Storage policies cannot automatically see Firebase Auth users when uploads happen directly from the browser with a publishable key. The current UI blocks upload unless `members/<uid>/uploadApproved` is true, but the strongest production setup is a server upload endpoint with a Supabase service-role key stored only on the server.

If this site is later converted to Next.js, then add the Supabase SSR `server.ts`, `client.ts`, and middleware files inside the Next app structure.
