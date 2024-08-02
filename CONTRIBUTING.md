# How to contribute

Howdy! Usual good software engineering practices apply. Write tests. Write comments. Use `npm run fmt` to tidy up formatting.

1. Make sure to have concise project name (in relevant directories).
2. Make sure to have package.json follow a with-{technology}-{usecase}-{framework}-{deployment-platform} naming convention. `technology`, `usecase` and `deployment-platform` are optional, and should be used to represent a specific integration example.
3. Always have an example environment variables (if required to run the example) with comments. Following is a sample:

```bash
# Postgres URL retrieved here: https://console.neon.tech
POSTGRES_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"

# OpenAI key retrieved here: https://platform.openai.com/api-keys
OPENAI_API_KEY="sk-..."
```

There are soft spots in the code, which could use cleanup, refactoring, additional comments, and so forth. Let's try to raise the bar, and clean things up as we go. Try to leave code in a better shape than it was before.

## Submitting changes

1. Get at least one +1 on your PR before you push. For simple patches, it will only take a minute for someone to review it.

2. Don't force push small changes after making the PR ready for review. Doing so will force readers to re-read your entire PR, which will delay the review process.

*Happy Hacking!*
