# Exercise media sourcing and licensing

FitLoop must not publish an exercise image, animation or video until the exact asset and its reuse terms have been checked. A licence attached to a repository's code does not automatically establish the rights to media stored in that repository.

## Current decision

No third-party exercise media is approved for production use yet. The exercise guide remains text-first, and the media fields stay optional until an asset has a complete provenance record.

## Candidate source review

### RepDB free exercise illustrations

- Source: https://github.com/RepDB/exercise-dataset
- Data licence: https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md
- Attribution instructions: https://github.com/RepDB/exercise-dataset/blob/main/ATTRIBUTION.md
- The published free tier licence expressly permits personal and commercial use of the static WebP images inside applications, provided the visible attribution is included.
- The licence prohibits republishing the collection as a dataset or API and prohibits generative-AI derivation from the images.
- Paid-tier preview animations are explicitly evaluation-only and must not be copied into FitLoop.
- Decision: candidate for individually matched still illustrations only. Before integration, verify the current licence, identify the exact matching exercise, record the source file and attribution, and check that the image is from the free tier rather than a paid preview. Do not import the dataset wholesale.

### Wikimedia Commons

- Reuse guidance: https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en
- Individual files can have different authors, licences, attribution requirements and other restrictions. The file page must be checked individually, including any ShareAlike requirement and possible personality/privacy rights for identifiable people.
- Decision: acceptable as an asset-by-asset research source, not as a blanket licence for a group of exercise images or videos.

### Exercise video dataset with unclear provenance

- Candidate repository: https://github.com/michael-lemarec/free-exercise-db-api
- Its code and exercise metadata are published under MIT, but its README states that the author bought the videos from a seller and does not know where that seller originally obtained them.
- Decision: do not use its videos or thumbnails in FitLoop unless the actual rights holder provides written permission or a verifiable licence. The repository's MIT code licence does not resolve that provenance warning.

## Required media ledger

For every asset approved for use, record all of the following in the exercise record or a checked-in media ledger:

| Field | Requirement |
|---|---|
| Exercise slug | Exact FitLoop catalogue movement |
| Asset role | Still, thumbnail, animation or video |
| Local path or stable source URL | Exact file used |
| Creator / rights holder | Named creator or organisation |
| Original source page | Direct page for the individual asset |
| Licence | Exact licence name and version |
| Licence URL | Full legal licence text |
| Attribution | Exact credit text to display |
| Changes | Cropping, resizing, format conversion or other edits |
| Checked date | Date the asset and licence were reviewed |
| Approval status | Pending, approved or rejected |

Do not infer a licence from search snippets, filenames, repository badges or another asset in the same collection. Keep the media URL, source and licence fields empty until the ledger is complete. If a licence requires ShareAlike, preserve that requirement for the image and any adaptations; do not imply it applies to FitLoop's unrelated application code.

## Integration checklist

1. Match the asset to the exact movement and confirm that it demonstrates the correct variation and equipment.
2. Open the original asset page and verify creator, rights holder, licence version and attribution wording.
3. Check model/performer releases and other non-copyright restrictions where identifiable people appear.
4. Download only the individual assets approved for use; do not mirror an entire third-party dataset.
5. Store attribution and licence metadata alongside each asset, and expose required credits in the app.
6. Confirm the source and licence still permit the intended deployment and distribution model.
7. Add tests that reject incomplete media metadata and verify that approved assets render with accessible alternative text.

## Current status

- Exercise text and coaching guidance: available across the existing 101-movement catalogue.
- Approved third-party still images: 0.
- Approved third-party exercise videos: 0.
- Unverified media URLs: none should be added.
- Original filmed media: a future option, subject to performer consent, production and release documentation.

This document records technical due diligence, not legal advice. Obtain university or qualified legal review before relying on a licence for a public or commercial release.
