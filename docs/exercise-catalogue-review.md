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

#

## First-pass source review — priority 1

This is a content-audit queue based on reading the current seed definitions and guide text. It is **not** a biomechanical verdict, a safety certification or an expert sign-off. The questions below identify what a qualified reviewer should explicitly verify before approving each entry.

| Exercise | Points to verify during expert review | Current decision |
|---|---|---|
| Conventional deadlift (`deadlift`) | Confirm the full setup and lift/lower sequence; check that bracing, bar path and finish-position wording are sufficiently clear without prescribing one body shape. | Pending evidence and qualified review |
| Barbell good morning (`good-morning`) | Check bar placement, load selection, hinge depth and the criteria for ending the descent when the lifter can no longer maintain the intended trunk position. | Pending evidence and qualified review |
| Sumo deadlift (`sumo-deadlift`) | Check stance/toe-angle wording, knee tracking cue, bracing and whether the guide makes clear that stance width is individual rather than fixed. | Pending evidence and qualified review |
| Nordic hamstring curl (`nordic-hamstring-curl`) | Verify the anchor/support instructions, safe assistance options, progression from partial range and how the return phase is described. | Pending evidence and qualified review |
| Copenhagen plank (`copenhagen-plank`) | Verify support placement and the distinction between short-lever/bent-knee and long-lever variations; ensure the alternatives are labelled as regressions rather than identical exercises. | Pending evidence and qualified review |
| Parallel bar dip (`parallel-bar-dip`) | Check shoulder-range guidance, assistance/regression options and whether the guide gives a clear response to discomfort rather than encouraging a deeper stretch. | Pending evidence and qualified review |
| Pull-up (`pull-up`) | Check grip terminology, start and finish positions, shoulder control, scaling options and whether “chin clears the bar” is framed as a target rather than a forced range. | Pending evidence and qualified review |
| Hanging leg raise (`hanging-leg-raise`) | Check that the guide distinguishes hip flexion from deliberate pelvic/trunk movement, and offers a practical regression for grip or swing limitations. | Pending evidence and qualified review |
| Squat (`squat`) | Check bar-rack setup and safety arms/spotter guidance, stance and depth language, bracing, and the use of a comfortable range suited to the lifter. | Pending evidence and qualified review |
| Romanian deadlift (`romanian-deadlift`) | Check the hinge description, knee position, bar proximity, individual range limit and whether the return cue avoids excessive lumbar extension. | Pending evidence and qualified review |
| Bulgarian split squat (`bulgarian-split-squat`) | Check rear-foot support stability, stance setup, balance assistance and whether the front-leg range cue is sufficiently adaptable. | Pending evidence and qualified review |
| Single-leg Romanian deadlift (`single-leg-romanian-deadlift`) | Check balance regressions, pelvic-rotation wording, load placement and whether the guide offers a supported variation before balance becomes the limiting factor. | Pending evidence and qualified review |
| Front squat (`front-squat`) | Check rack height and safe bar release, front-rack grip alternatives, wrist/shoulder mobility assumptions and adaptable depth. | Pending evidence and qualified review |
| Trap-bar deadlift (`trap-bar-deadlift`) | Check handle-height variation, equipment access, safe setup and whether the guide avoids implying that every trap-bar design produces the same movement. | Pending evidence and qualified review |
| Bench dip (`bench-dip`) | Explicitly review shoulder-extension demands and suitability; check whether the guide should prioritise a different triceps exercise as the regression instead of implying that a shallower dip is appropriate for everyone. | Pending evidence and qualified review |

### First-pass editorial observations

- The current guides do provide movement-specific cues for these entries, but they do not consistently spell out equipment safety checks (for example, rack safety arms, stable supports or secure anchoring). Reviewers should decide which checks belong in the short guide and which belong in a separate safety note.
- Some alternatives change the movement or loading demands. The UI should not imply that every listed alternative is mechanically interchangeable; the reviewer should classify them as regressions, equipment substitutions or related alternatives.
- The bench dip entry deserves explicit suitability review rather than relying only on a “comfortable shoulder range” cue. No change to its exercise prescription is made by this editorial flag; a qualified reviewer must decide whether to retain, revise or remove it.
- The catalogue currently has no attached instructional media. Reviewers must assess whether text alone communicates the setup adequately, while media acquisition remains subject to the separate licensing process.

These observations are prompts for review, not claims that any listed movement is inherently unsafe or incorrectly prescribed. No priority-1 movement is marked approved by this pass.

## Priority 2 — remaining compound and loaded movements

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
