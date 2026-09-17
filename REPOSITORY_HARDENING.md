# Repository Hardening Checklist

Repository files cannot prevent copying from a public repository. Apply these controls to protect the canonical history and reduce unnecessary exposure.

## Before sending the interview link

- [ ] Replace the handle-only copyright identification with the legal copyright holder name if appropriate.
- [ ] Send `EVALUATOR_AUTHORIZATION_TEMPLATE.md` to named evaluators with an expiry date and retain their acknowledgement.
- [ ] Run `npm run check:license`, `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- [ ] Create an annotated tag for the exact reviewed commit; use a cryptographically signed tag when a signing key is available.
- [ ] Create a GitHub Release from that tag and retain its source archive checksum privately.
- [ ] Save `git bundle --all` plus its SHA-256 in private, access-controlled storage.

## GitHub ruleset for `main`

- [ ] Block force pushes and branch deletion.
- [ ] Require a linear history.
- [ ] Require pull requests and CODEOWNERS review when collaborators exist.
- [ ] Require the `License policy` and normal test/build status checks.
- [ ] Require signed commits after confirming the local signing workflow works.
- [ ] Protect tags matching `submission-*` from update or deletion.

These settings protect the canonical repository; they do not restrict forks.

## Public-exposure controls

- [ ] Keep all data synthetic and scan every commit for credentials.
- [ ] Disable Wiki and public Discussions if they are not needed.
- [ ] Do not upload the evaluator’s private prompt, company confidential material, personal data, or private AI transcripts.
- [ ] Keep the visible Artifact ID in README, NOTICE, UI footer, release notes, and demo recording.
- [ ] Search GitHub periodically for the Artifact ID and a few distinctive non-secret phrases.

## After the evaluation

- [ ] Ask the evaluator to confirm deletion or its documented retention requirement.
- [ ] Change the repository to private unless continued public access is genuinely needed.
- [ ] Remember that existing public forks and local clones may remain.
- [ ] If copied expression appears elsewhere, preserve URLs, timestamps, diffs, tags, and private provenance evidence before contacting the party or platform.
- [ ] Use GitHub’s DMCA process only for genuine copyright infringement after investigating ownership, authorization, and possible fair use; obtain legal advice for consequential disputes.

Do not add tracking beacons, phone-home code, destructive logic, credential traps, or obfuscation. They do not create reliable copyright protection and can introduce privacy, security, and interview risks.
