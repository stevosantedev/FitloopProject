# Exercise catalogue quality review

Last reviewed: 5 November 2026

## Purpose and status

This document separates automated catalogue integrity checks from the human review needed to establish that exercise descriptions, coaching cues and muscle assignments are suitable.

The current seed contains 101 exercise definitions and 101 guide entries. A source-level structural audit on 5 November 2026 confirmed that every exercise slug has exactly one matching guide entry, with no missing or orphaned guide keys. The catalogue currently uses 44 distinct movement-pattern labels.

**Status: structurally complete; subject-matter review not yet signed off.** The audit above does not establish that an exercise is biomechanically classified correctly, that the instructions are safe for every user, or that primary/secondary muscle roles are scientifically settled.

## Review order

Review the movements in these groups first, then work through the remaining catalogue. The order is a workflow priority, not a claim that an exercise is unsafe or incorrectly described.

### Priority 1 — technically demanding or position-sensitive movements

- Conventional deadlift (`deadlift`)
- Barbell good morning (`good-morning`)
- Sumo deadlift (`sumo-deadlift`)
- Nordic hamstring curl (`nordic-hamstring-curl`)
- Copenhagen plank (`copenhagen-plank`)
- Parallel bar dip (`parallel-bar-dip`)
- Pull-up (`pull-up`)
- Hanging leg raise (`hanging-leg-raise`)
- Squat (`squat`)
- Romanian deadlift (`romanian-deadlift`)
- Bulgarian split squat (`bulgarian-split-squat`)
- Single-leg Romanian deadlift (`single-leg-romanian-deadlift`)
- Front squat (`front-squat`)
- Trap-bar deadlift (`trap-bar-deadlift`)
- Bench dip (`bench-dip`)

### Priority 2 — remaining compound and loaded movements

Review the remaining barbell, dumbbell, cable, machine and bodyweight compound movements for setup, range-of-motion language, bracing, equipment assumptions, regressions and clear stop conditions.

### Priority 3 — isolation, conditioning and trunk movements

Review the remaining movements for terminology, target muscle rationale, appropriate exercise alternatives and whether the movement-pattern label describes the primary action rather than merely the equipment or body region.

## Review rubric

For every movement, record a decision for each item:

1. **Identity and variation:** name, common aliases and equipment match the actual movement shown/described.
2. **Setup:** starting position, equipment adjustment and contact points are understandable.
3. **Execution:** steps are ordered, observable and specific enough to guide a novice without implying a single mandatory body shape for all anatomies.
4. **Breathing and bracing:** cues are relevant and do not prescribe unsafe breath-holding as a universal rule.
5. **Range and control:** the text uses comfortable, controllable range language and avoids arbitrary universal depth or joint-position claims.
6. **Regression and progression:** alternatives are genuinely comparable, accessible and labelled accurately; they are not presented as interchangeable where loading or mechanics differ substantially.
7. **Muscle roles:** primary and secondary links are defensible for the described variation, with relevant stabilisers distinguished from prime movers.
8. **Movement pattern:** category is consistent with the main joint action and intended training classification.
9. **Risk communication:** advanced or demanding movements include proportionate setup, assistance or regression cues where appropriate; the guide does not diagnose or promise injury prevention.
10. **Accessibility and clarity:** terms are defined where needed, instructions avoid unexplained jargon and content remains useful without media.

## Evidence and sign-off rules

- Record the reference used for each substantive decision (for example, a recognised strength-and-conditioning textbook, peer-reviewed review, professional-body guidance or a qualified reviewer).
- Record reviewer name/role, review date, exercise slug, decision, rationale and any resulting change.
- Where sources disagree or muscle contribution depends on technique, state the limitation rather than forcing false precision.
- Have a suitably qualified strength-and-conditioning professional review technique and programming claims. Have an anatomy/biomechanics reviewer check muscle mappings and the anatomy illustration.
- Do not mark an item approved merely because it passes the seed validator or automated tests.
- Keep the exercise media licence ledger separate: technique accuracy does not establish permission to use a photograph or video.

## Review record

| Review item | Status |
|---|---|
| Definition/guide slug coverage (101/101) | Automated structural check passed |
| Missing or orphaned guide entries | None found in source-level audit |
| Non-empty and unique guide fields | Enforced by seed validation; CI pending for latest change |
| Technique accuracy for all 101 movements | Not yet expert-reviewed |
| Primary/secondary muscle mapping | Not yet independently verified |
| Movement-pattern taxonomy | Not yet independently verified |
| Anatomy artwork against a credible anatomy reference | Not yet independently verified |
| Licensed exercise stills/videos | 0 approved; see `docs/exercise-media-licensing.md` |

## Completion criteria

This review is complete only when all 101 movements have a recorded decision, evidence/reference, reviewer and date; corrections are implemented; the seed and API tests pass; and unresolved disagreements or limitations are documented. A blanket statement that the catalogue is “validated” must not be used before that evidence exists.
