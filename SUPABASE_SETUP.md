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

If the browser shows:

```json
{"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}
```

run `supabase-storage-policies.sql` in the Supabase SQL Editor. It makes the `user-files` bucket public and adds read/upload/delete policies for the current browser-based flow.

If this site is later converted to Next.js, then add the Supabase SSR `server.ts`, `client.ts`, and middleware files inside the Next app structure.

## PDF Signature Verification Queue

Manual admin verification uses a separate Supabase Storage bucket:

```text
pdf-verification
```

Flow:

1. Logged-in user uploads original PDF from `user-dashboard.html`.
2. Server stores the PDF in Supabase Storage and writes request metadata to Firebase:

```text
pdfVerificationRequests/<request-id>
userPdfVerificationRequests/<firebase-uid>/<request-id>
```

3. Admin opens `admin-requests.html`, downloads the original PDF, verifies it manually in Foxit Reader or another tool, then uploads the verified/green-tick PDF.
4. User sees status `Verified` and downloads the verified PDF from `user-dashboard.html`.

Server env required for this flow:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_keep_secret
SUPABASE_PDF_VERIFICATION_BUCKET=pdf-verification
```

The service role key must stay on the server only. Do not place it in browser JavaScript.
