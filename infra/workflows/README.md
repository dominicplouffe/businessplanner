# GitHub Actions workflows

These live here rather than in `.github/workflows/` because the session that
wrote them pushed with a token lacking GitHub's `workflow` scope, and GitHub
refuses such a push outright.

**Copy them into place before the first deploy:**

```bash
mkdir -p .github/workflows
cp infra/workflows/ci.yml infra/workflows/deploy.yml .github/workflows/
git add .github/workflows && git commit -m "Add CI and deploy workflows"
```

- `ci.yml` — typecheck, lint, tests, a production build and a container build,
  on every pull request and non-main branch.
- `deploy.yml` — on push to `main`: the same checks, then build and push the
  image, `cdk deploy`, wait for the service to stabilise, invalidate the edge,
  and confirm `/api/health` answers before calling it done.

`deploy.yml` needs one repository secret, `AWS_DEPLOY_ROLE_ARN`. Step 7 of
`DEPLOY.md` is how to create the role it names.
