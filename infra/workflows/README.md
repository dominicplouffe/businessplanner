# GitHub Actions workflows

These live here rather than in `.github/workflows/` because GitHub refuses any
push that creates or updates a file under `.github/workflows/` unless the
credential carries the `workflow` scope. Both routes available to the agent
sessions working on this repository lack it — the git push is rejected with
*refusing to allow an OAuth App to create or update workflow*, and the REST API
answers *Insufficient scope: required "workflow"*. So this is not a reminder that
somebody forgot: it is a step only a human credential can take.

**Until this is done, no workflow runs on any push.**

```bash
mkdir -p .github/workflows
git mv infra/workflows/ci.yml infra/workflows/deploy.yml .github/workflows/
git rm infra/workflows/README.md
git commit -m "Move the CI and deploy workflows into place" && git push
```

Then point the scan root in `tests/site.test.ts` at `.github/workflows` instead
of `infra/workflows`, so the domain-spelling check keeps covering them. If the
credential is the obstacle, GitHub's web editor can create the files directly —
the browser is always permitted to write workflows.

- `ci.yml` — typecheck, lint, tests, a production build and a container build,
  on every pull request and non-main branch.
- `deploy.yml` — on push to `main`: the same checks, then build and push the
  image, `cdk deploy`, wait for the service to stabilise, invalidate the edge,
  and confirm `/api/health` answers before calling it done.

`deploy.yml` needs one repository secret, `AWS_DEPLOY_ROLE_ARN`. Step 7 of
`DEPLOY.md` is how to create the role it names.
