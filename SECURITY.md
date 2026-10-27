# Security

The current release cannot sign or broadcast transactions and does not read wallet keys. Its optional collector reads public mainnet data using provider URLs supplied in the environment. It can send **public evidence** to a model provider only when `analyze` is called with that provider and an API key supplied through the environment. `.env` files are not automatically loaded. No dependency installation is required to run the code.

Do not send secrets, wallet data or private provider URLs in input files or issues. Inspect third-party feeds and packages before connecting them. Treat a model explanation as untrusted research text; it cannot override policy results.

For a vulnerability, use GitHub's private vulnerability reporting feature for this repository if available, or contact the maintainer privately through the profile. Do not publish exploit details or credentials in an issue.
