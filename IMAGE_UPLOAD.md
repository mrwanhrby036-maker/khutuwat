# Image uploads

The admin uploads files through the authenticated `/api/upload-image` endpoint to Postimages. Firebase token verification, active-admin checks, CORS allowlisting and image size/signature checks remain enabled.

Set `FIREBASE_PROJECT_ID`, `ALLOWED_ORIGINS` (comma-separated exact site origins) and `POSTIMAGES_API_KEY` in Vercel and redeploy. Optionally set `POSTIMAGES_GALLERY` to the gallery identifier required by your account. `_env.example` is a configuration template, not automatically loaded. The obsolete `_env` file was removed; `.gitignore` excludes local secret files. Never place API keys in browser JavaScript or commit them.

Postimages account API page: https://postimages.org/login/api

The integration uses the desktop-compatible form API and XML `<page>` response documented by the community integration at https://github.com/Redns/picgo-plugin-postimage/blob/master/src/index.js. This is not a verified public API contract. A real upload must be tested with the account API key before relying on it in production; provider changes or account restrictions can break direct uploads. Mock tests do not verify provider availability.

## Fallback

Paste a Postimages or ImgBB URL into the course/lesson image field. Pasting clears the selected file so retrying save uses the link instead. Direct HTTPS links on `i.postimg.cc` and `i.ibb.co` work without a provider key. Share pages on `postimg.cc`, `postimages.org`, and `ibb.co` are resolved server-side using `og:image`; these still require Firebase/server authorization settings. Redirects and arbitrary hosts are rejected. If a share page cannot be resolved, use the provider's **Direct link**. Existing ImgBB images remain supported.

Uploads failing do not silently substitute a previous image. Upload request names are unique UUIDs; the provider ultimately controls image IDs and may deduplicate identical content. A course/lesson document ID remains unchanged when editing its image.

Run regression tests: `node --test tests/image-host.test.js`.
