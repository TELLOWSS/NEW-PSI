# Inspector OCR dependency notices

The browser OCR runtime is copied during build from lockfile-resolved npm packages. No worker script or traineddata is fetched from a third-party CDN at runtime. Image bytes are processed on the user's device; hosting still serves the runtime assets.

| Package | Locked version at implementation | Package license metadata |
|---|---|---|
| tesseract.js | 6.0.1 | Apache-2.0 |
| tesseract.js-core | 6.1.2 | Apache-2.0 |
| @tesseract.js-data/eng | 1.0.0 | MIT |
| @tesseract.js-data/kor | 1.0.0 | MIT |
| @tesseract.js-data/vie | 1.0.0 | MIT |
| @tesseract.js-data/chi_sim | 1.0.0 | MIT |

Sources: [Tesseract.js](https://github.com/naptha/tesseract.js), [Tesseract.js core](https://github.com/naptha/tesseract.js-core), [language package project](https://github.com/naptha/tessdata), and each installed package's `package.json`/README. Preserve upstream licenses and attribution in redistribution. The build copies the JS/core license texts and this notice alongside OCR assets. Language wrapper package metadata is not a substitute for reviewing upstream traineddata redistribution terms before commercial release.

Ajv 8.20.0 (MIT) validates the manual-import JSON schema. No paid AI SDK is invoked by the Inspector feature. Existing application dependencies and their licenses remain governed by the repository's existing dependency policy.
