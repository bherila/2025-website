# PHR OHIF Viewer

The PHR UI's Viewer button on each study opens the OHIF Viewer in a new tab pointed at the patient's authenticated `viewer-json` manifest:

```text
/ohif/viewer/dicomjson?url=<encoded-manifest-url>
```

where the manifest URL is:

```text
/api/phr/patients/{patient}/dicom/studies/{study}/viewer-json
```

OHIF loads the manifest with the browser's session cookie, then fetches each instance directly from the signed storage URLs the manifest contains:

```text
dicomweb:https://<dicom-storage-host>/<signed-object-url>
```

The manifest endpoint is protected by the existing `web` + `auth` middleware. Instance URLs are generated with Laravel `temporaryUrl()` against the `phr_dicom` disk and expire after `PHR_DICOM_VIEWER_URL_TTL_MINUTES` (default 30). The older `/api/phr/patients/{patient}/dicom/instances/{instance}/file` endpoint still performs the same access check, then redirects to a short-lived storage URL instead of streaming the object through PHP.

The DICOM storage origin must remain allowed by CSP `connect-src` and by the R2 bucket CORS policy for browser GETs. ZIP downloads of the originals are still served by:

```text
/api/phr/patients/{patient}/dicom/studies/{study}/download
```

## OHIF deployment

OHIF is not committed to this repo. It lives at `~/bwh-php/public/ohif/` on the server and is deployed by a separate, manually triggered workflow at `.github/workflows/ohif-dist.yml`:

1. Run **Actions -> OHIF Dist -> Run workflow** in GitHub and supply a tag (default `v3.12.0`).
2. The workflow checks out OHIF at that tag, patches `platform/app/public/config/default.js` via `.github/ohif/patch-config.mjs` to set `routerBasename: '/ohif/'` and `defaultDataSourceName: 'dicomjson'`, runs `PUBLIC_URL=/ohif/ yarn build`, and rsyncs the resulting `platform/app/dist/` to `~/bwh-php/public/ohif/` with `--delete`.
3. The main app deploy in `.github/workflows/ci.yml` rsyncs `public/` with `--exclude='ohif'`, so app deploys never clobber the viewer.

The workflow also re-runs on pushes to `.github/ohif/**` so iterations on the patcher script redeploy automatically. For everything else, including OHIF version bumps, trigger it by hand.
