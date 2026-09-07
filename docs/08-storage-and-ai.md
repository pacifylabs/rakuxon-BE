# Storage (Cloudinary) & AI Gateway Spec — Rakuxon API
**Repo:** `rakuxon-BE`

---

## Part A — Storage with Cloudinary

Cloudinary stores **all** files this phase — images and raw documents (PDFs, transcripts) — behind a `StorageProvider` interface so it's swappable later.

### Interface

```
StorageProvider {
  signUpload(input: {
    tenantId, studentId, documentType, filename, contentType
  }): {
    signature, timestamp, apiKey, cloudName, folder, publicId, resourceType
  }
  getSignedUrl(publicId, opts?): string     // short-lived, authenticated delivery
  delete(publicId): Promise<void>
}
```

`cloudinary.provider.ts` implements it. No other file imports the Cloudinary SDK.

### Upload flow (signed direct-to-Cloudinary) — chosen

```
1. Client → POST /documents/sign-upload   (authenticated)
2. Service authorizes: is this student, in this tenant, allowed to upload this type?
3. Build signature pinning:
     folder       = {CLOUDINARY_UPLOAD_FOLDER_ROOT}/{tenantId}/{studentId}/{documentType}
     type         = 'authenticated'        (NOT public)
     resourceType = 'raw' for docs, 'image' for photos (or 'auto')
     allowed formats + max bytes
     timestamp    (short validity)
4. Return signature + params (NEVER the api secret)
5. Client uploads bytes directly to Cloudinary with the signature
6. Client → POST /documents/confirm { publicId, version, bytes }
7. Service records Document(tenant_id, student_id, publicId, version) + enqueues AI check
```

The API authorizes but never carries file bytes → no proxy bottleneck.

### Secure delivery

- All documents stored as **`type: authenticated`** — no public URLs.
- Viewing → `GET /documents/:id/url` → authz check → `getSignedUrl(publicId)` returns a signed URL valid for `CLOUDINARY_SIGNED_URL_TTL`.
- Folder path embeds `tenantId`, mirroring isolation into Cloudinary's namespace.

### Rules & caveats

- **API secret is backend-only.** FE gets `cloud_name` (public-safe) and a per-upload signature.
- Raw files skip image transforms (fine — only real images use transforms).
- **Virus-scan hook** runs before a document is marked reviewable (interface real; engine pluggable).
- `StorageProvider` stays even though we're "Cloudinary for everything" — no lock-in.

### TDD for storage

- Test signing pins the right folder + `authenticated` type (Cloudinary SDK mocked).
- Test `confirm` records the document + enqueues the AI job.
- Test `:id/url` returns a signed URL only after authz; denies cross-tenant.

---

## Part B — AI Gateway

Single provider-agnostic entry point for all AI. Built cost-safe from day one.

### Responsibilities

- **Routing:** classify the document, send simple/clean docs to a cheap/OCR model, escalate only complex ones to a stronger model.
- **Caching:** prompt-cache repeated instruction context (the check prompts are highly repetitive).
- **Quota:** enforce per-tenant limits; block or queue over-limit calls.
- **Metering:** emit a `UsageEvent(tenant, meter, quantity)` on every call.
- **Fallback:** on provider failure, retry on a secondary model; the user request still succeeds.

### Document-check pipeline (async, BullMQ)

```
document confirmed → enqueue check job →
  classify type → extract key fields →
  flag: missing docs · name/DOB mismatch across docs · expiry · low-quality scan →
  store ai_check_json on the Document → surface in counselor review →
  emit UsageEvent
```

### Config (no hard-coded model names in logic)

```
AI_PRIMARY_MODEL=       # escalation model
AI_OCR_MODEL=           # cheap default for clean docs
AI_FALLBACK_MODEL=
AI_PROVIDER_API_KEY=
AI_TENANT_MONTHLY_LIMIT_DEFAULT=
```

### TDD for AI

- Test router picks OCR vs escalation by document complexity (provider mocked).
- Test quota blocks/queues over-limit.
- Test each call emits exactly one `UsageEvent`.
- Test fallback path: primary throws → secondary succeeds → request ok.
- Test the pipeline sets the expected flags on a fixture document.

### Cost discipline

Route + cache + batch keeps a check in the low single-digit cents. Never send everything to a flagship model. Cost per check is logged and reconciled against the provider bill.
